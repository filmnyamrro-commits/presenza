import { signInWithPopup } from 'firebase/auth';
import {
  CheckCircle2,
  KeyRound,
  Laptop,
  Loader2,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  formatFirebaseAuthError,
  googleProvider,
  normalizeAdminEmail,
} from '../firebase';
import type { OrganizationBranding } from '../types';
import {
  authorizeCurrentDeviceAsOwner,
  checkDeviceAuthStatus,
  clearStoredDeviceToken,
  getDefaultDeviceLabel,
  getOrCreateLocalDeviceId,
  pollDirectOwnerApproval,
  requestOwnerVerificationCode,
  verifyDeviceCode,
} from '../utils/deviceAuthClient';

interface DeviceAuthGateProps {
  branding?: OrganizationBranding | null;
  isDirectQrLink: boolean;
  children: ReactNode;
}

export default function DeviceAuthGate({
  branding,
  isDirectQrLink,
  children,
}: DeviceAuthGateProps) {
  const deviceId = useMemo(() => getOrCreateLocalDeviceId(), []);
  const [status, setStatus] = useState<
    'checking' | 'unauthorized' | 'welcome' | 'authorized'
  >('checking');
  const [wasRevoked, setWasRevoked] = useState(false);

  const [deviceLabel, setDeviceLabel] = useState(getDefaultDeviceLabel);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);

  const [codeInput, setCodeInput] = useState('');
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [ownerSigningIn, setOwnerSigningIn] = useState(false);

  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(
    'Device successfully authenticated. Welcome!'
  );

  const performStatusCheck = useCallback(
    async (silent = false) => {
      if (!silent) {
        setStatus('checking');
      }
      try {
        const res = await checkDeviceAuthStatus();
        if (
          res.authorized ||
          (isDirectQrLink && res.policy?.allowDirectQrWithoutDeviceAuth)
        ) {
          setWasRevoked(false);
          setStatus('authorized');
          return;
        }
        if (res.revoked) {
          setWasRevoked(true);
        }
        setStatus((prev) => (prev === 'welcome' ? 'welcome' : 'unauthorized'));
      } catch {
        // Keep current status on transient network blips if already authorized
        setStatus((prev) => (prev === 'authorized' ? 'authorized' : 'unauthorized'));
      }
    },
    [isDirectQrLink]
  );

  useEffect(() => {
    void performStatusCheck(false);
  }, [performStatusCheck]);

  // Periodic background verification so revoked devices lose access promptly
  useEffect(() => {
    if (status !== 'authorized') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void performStatusCheck(true);
      }
    };
    const interval = window.setInterval(() => {
      void performStatusCheck(true);
    }, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, performStatusCheck]);

  // Live 5-minute countdown timer
  useEffect(() => {
    if (!expiresAtMs) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setRemainingSec(diff);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs]);

  // Poll for direct owner approval when a challenge is active
  useEffect(() => {
    if (status !== 'unauthorized' || !challengeId || remainingSec <= 0) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await pollDirectOwnerApproval(deviceId, challengeId);
        if (res.approved) {
          setWelcomeMessage(
            res.message || 'Device successfully authenticated. Welcome!'
          );
          setStatus('welcome');
        }
      } catch {
        // Ignore poll error
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status, challengeId, remainingSec, deviceId]);

  // Auto-enter app smoothly after showing the welcome confirmation message
  useEffect(() => {
    if (status !== 'welcome') return;
    const timer = window.setTimeout(() => {
      setStatus('authorized');
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleRequestCode = async () => {
    setErrorMessage(null);
    setDeliveryNotice(null);
    setRequestingCode(true);
    try {
      const res = await requestOwnerVerificationCode(
        deviceId,
        deviceLabel.trim() || getDefaultDeviceLabel()
      );
      setChallengeId(res.challengeId);
      setExpiresAtMs(Date.parse(res.expiresAtIso) || Date.now() + 5 * 60 * 1000);
      setEmailSent(res.emailSent);
      setDeliveryNotice(res.deliveryNote);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not request authentication code.'
      );
    } finally {
      setRequestingCode(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = codeInput.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code from the owner.');
      return;
    }
    setErrorMessage(null);
    setVerifyingCode(true);
    try {
      const res = await verifyDeviceCode({
        deviceId,
        challengeId,
        code: cleaned,
        deviceName: deviceLabel.trim() || getDefaultDeviceLabel(),
      });
      setWasRevoked(false);
      setWelcomeMessage(
        res.message || 'Device successfully authenticated. Welcome!'
      );
      setStatus('welcome');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Verification failed. Please check the code.'
      );
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleOwnerBootstrapSignIn = async () => {
    setErrorMessage(null);
    setOwnerSigningIn(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const emailLower = cred.user.email
        ? normalizeAdminEmail(cred.user.email)
        : '';
      if (emailLower !== BOOTSTRAPPED_ADMIN_EMAIL) {
        clearStoredDeviceToken();
        setErrorMessage(
          `Signed in as ${cred.user.email || 'unknown account'}. Only the primary owner (${BOOTSTRAPPED_ADMIN_EMAIL}) can authorize a new device directly. Please request a verification code from the owner.`
        );
        return;
      }
      const idToken = await cred.user.getIdToken(true);
      const res = await authorizeCurrentDeviceAsOwner(
        idToken,
        deviceId,
        deviceLabel.trim() || getDefaultDeviceLabel()
      );
      setWasRevoked(false);
      setWelcomeMessage(
        res.message || 'Device successfully authenticated. Welcome!'
      );
      setStatus('welcome');
    } catch (err) {
      const formatted = formatFirebaseAuthError(err);
      setErrorMessage(formatted.message);
    } finally {
      setOwnerSigningIn(false);
    }
  };

  if (status === 'authorized') {
    return <>{children}</>;
  }

  const orgName = branding?.organizationName?.trim() || '';
  const logoUrl = branding?.logoDataUrl || '';
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Verifying device authorization...
        </p>
      </div>
    );
  }

  if (status === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white border border-emerald-200 rounded-2xl p-8 text-center shadow-lg space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              {orgName ? `${orgName} · PRESENZA` : 'PRESENZA'}
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900">
              {welcomeMessage}
            </h1>
            <p className="text-xs text-slate-600">
              This device is now remembered and authorized for future sessions until revoked by the owner.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStatus('authorized')}
            className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors"
          >
            Continue to Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Top Security Header */}
        <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-slate-100 text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={orgName ? `${orgName} logo` : 'Organization logo'}
                className="h-11 w-11 rounded-xl object-contain bg-white border border-slate-200 p-1"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              {orgName ? `${orgName} · PRESENZA` : 'PRESENZA'}
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-display font-bold text-slate-900">
              Device Authorization Required
            </h1>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              This device is not yet authorized. Please request an authentication code from the application owner.
            </p>
          </div>

          {wasRevoked && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 flex items-start gap-2 text-left"
            >
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                This device&apos;s previous authorization was revoked by the owner. Request and enter a new verification code to regain access.
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {/* Step 1: Request Code */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-800">
                <Laptop className="w-4 h-4 text-blue-700" />
                <span>Step 1 · Request Owner Code</span>
              </div>
              {remainingSec > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold text-blue-700">
                  <Timer className="w-3.5 h-3.5" />
                  <span>
                    {String(mins).padStart(2, '0')}:
                    {String(secs).padStart(2, '0')}
                  </span>
                </span>
              )}
            </div>

            <div>
              <label
                htmlFor="device-label-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Device Name (helps owner identify this screen)
              </label>
              <input
                id="device-label-input"
                type="text"
                maxLength={80}
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="e.g. Auditorium Projector Laptop"
                className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              disabled={requestingCode}
              onClick={() => void handleRequestCode()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {requestingCode ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 text-blue-700" />
              )}
              <span>
                {challengeId
                  ? 'Resend Verification Code to Owner'
                  : 'Request Verification Code'}
              </span>
            </button>

            {deliveryNotice && (
              <div
                className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
                  emailSent
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-blue-200 bg-white text-slate-700'
                }`}
              >
                {deliveryNotice}
              </div>
            )}
          </div>

          {/* Step 2: Enter Verification Code */}
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-800">
              <KeyRound className="w-4 h-4 text-slate-700" />
              <span>Step 2 · Enter 6-Digit Verification Code</span>
            </div>

            <input
              id="device-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codeInput}
              onChange={(e) =>
                setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              aria-label="6-digit verification code"
              className="w-full min-h-[54px] px-4 py-2.5 text-center text-2xl font-mono-tabular font-bold tracking-[0.35em] bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={verifyingCode || codeInput.replace(/\D/g, '').length !== 6}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {verifyingCode ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>
                {verifyingCode ? 'Verifying Code...' : 'Verify & Authorize Device'}
              </span>
            </button>
          </form>

          {/* Primary Owner Google Auth Option */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5 text-center">
            <p className="text-xs text-slate-500">
              Primary owner (<span className="font-semibold text-slate-700">{BOOTSTRAPPED_ADMIN_EMAIL}</span>)? Sign in directly with Google to authorize this device:
            </p>
            <button
              type="button"
              disabled={ownerSigningIn}
              onClick={() => void handleOwnerBootstrapSignIn()}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {ownerSigningIn && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Sign in as Primary Owner</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
