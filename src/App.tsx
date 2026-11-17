/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import AdminConsole from './components/AdminConsole';
import ErrorBoundary from './components/ErrorBoundary';
import ParticipantCheckIn from './components/ParticipantCheckIn';
import { auth, db, handleFirestoreError } from './firebase';
import { OperationType, type OrganizationBranding } from './types';

type ViewMode = 'checkin' | 'admin';

function readInitialEventId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('event');
  return raw ? raw.trim() : null;
}

function isAdminLocation(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  return window.location.hash === '#admin' || path === '/admin';
}

function readInitialView(): ViewMode {
  if (isAdminLocation() && !readInitialEventId()) {
    return 'admin';
  }
  return 'checkin';
}

export default function App() {
  const [view, setView] = useState<ViewMode>(readInitialView);
  const [requestedEventId, setRequestedEventId] = useState<string | null>(
    readInitialEventId
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  // When a participant enters via QR link (/?event=<id>), hide all Admin menu & sign-in controls
  const isQrParticipantView = Boolean(requestedEventId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'branding', 'default'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            organizationName?: string;
            logoDataUrl?: string;
          };
          setBranding({
            organizationName: (data.organizationName || '').trim(),
            logoDataUrl: data.logoDataUrl || '',
          });
        } else {
          setBranding(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'branding/default');
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      const ev = readInitialEventId();
      setRequestedEventId(ev);
      if (isAdminLocation() && !ev) {
        setView('admin');
      } else {
        setView('checkin');
      }
    };
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, []);

  const navigateToView = (nextView: ViewMode) => {
    setView(nextView);
    if (nextView === 'admin') {
      window.history.replaceState(null, '', '/#admin');
    } else {
      const search = requestedEventId
        ? `?event=${encodeURIComponent(requestedEventId)}`
        : '';
      window.history.replaceState(null, '', `/${search}`);
    }
  };

  const handleSelectEventId = (eventId: string | null) => {
    setRequestedEventId(eventId);
    setView('checkin');
    const nextUrl = eventId ? `/?event=${encodeURIComponent(eventId)}` : '/';
    window.history.replaceState(null, '', nextUrl);
  };

  const orgName = branding?.organizationName?.trim() || '';
  const logoUrl = branding?.logoDataUrl || '';

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Top Bar: Top-left school/company logo & name + PRESENZA branding */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateToView('checkin');
              }}
              className="flex items-center gap-3 min-w-0 shrink-0"
            >
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={orgName ? `${orgName} logo` : 'Organization logo'}
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                />
              )}
              <div className="min-w-0 flex flex-col leading-tight">
                {orgName ? (
                  <>
                    <span className="font-display text-sm sm:text-base font-extrabold tracking-tight text-slate-900 truncate max-w-[200px] sm:max-w-[280px]">
                      {orgName}
                    </span>
                    <span className="text-[11px] font-bold tracking-wider text-blue-700 uppercase">
                      PRESENZA
                    </span>
                  </>
                ) : (
                  <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                    PRESENZA
                  </span>
                )}
              </div>
            </a>

            {isQrParticipantView ? (
              <div className="flex items-center shrink-0">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                  Participant Check-In
                </span>
              </div>
            ) : (
              <>
                <nav
                  className="hidden sm:flex items-center gap-6 text-sm font-medium"
                  aria-label="Primary navigation"
                >
                  <button
                    type="button"
                    onClick={() => navigateToView('checkin')}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                      view === 'checkin'
                        ? 'border-blue-700 text-slate-900 font-semibold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Participant Check-In
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToView('admin')}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                      view === 'admin'
                        ? 'border-blue-700 text-slate-900 font-semibold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Admin Console
                  </button>
                </nav>

                <div className="flex items-center shrink-0">
                  {view === 'checkin' ? (
                    <button
                      type="button"
                      onClick={() => navigateToView('admin')}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      {user ? 'Admin Console' : 'Admin Sign In'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateToView('checkin')}
                      className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      Check-In Form
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1">
          {view === 'checkin' ? (
            <ParticipantCheckIn
              requestedEventId={requestedEventId}
              user={user}
              onSelectEventId={handleSelectEventId}
              onGoToAdmin={
                isQrParticipantView ? undefined : () => navigateToView('admin')
              }
            />
          ) : (
            <AdminConsole
              user={user}
              authReady={authReady}
              branding={branding}
              onOpenCheckIn={(eventId) => handleSelectEventId(eventId)}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {orgName ? `${orgName} · ` : ''}PRESENZA · Workshops, Seminars &amp; Professional Development
            </span>
            <span>
              QR attendance check-in (email login optional per session)
            </span>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
