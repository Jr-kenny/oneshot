import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './components/LandingPage';
import { DemoConsole } from './components/DemoConsole';
import { HowItWorks } from './components/HowItWorks';
import { BuildersPage } from './components/BuildersPage';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [triggerAutoStart, setTriggerAutoStart] = useState<boolean>(false);

  useEffect(() => {
    // Handle initial route from pathname or hash
    const path = window.location.pathname;
    const search = window.location.search;
    const urlParams = new URLSearchParams(search);

    if (urlParams.get('autostart') === '1' || path === '/demo') {
      setCurrentRoute('/demo');
      setTriggerAutoStart(true);
    } else if (path === '/how-it-works') {
      setCurrentRoute('/how-it-works');
    } else if (path === '/builders') {
      setCurrentRoute('/builders');
    } else {
      setCurrentRoute('/');
    }

    const handlePopState = () => {
      const p = window.location.pathname;
      if (p === '/demo' || p === '/how-it-works' || p === '/builders') {
        setCurrentRoute(p);
      } else {
        setCurrentRoute('/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (route: string) => {
    setCurrentRoute(route);
    window.history.pushState({}, '', route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartDemoRun = () => {
    setTriggerAutoStart(true);
    // Reset trigger after tick so subsequent runs can start
    setTimeout(() => setTriggerAutoStart(false), 200);
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-[#E6EAF0] flex flex-col font-sans selection:bg-[#F5A524]/20 selection:text-[#F5A524]">
      {/* Top 56px sticky navigation */}
      <Navbar
        currentRoute={currentRoute}
        onNavigate={navigate}
        onStartDemoRun={handleStartDemoRun}
      />

      {/* Main Content View */}
      <main className="flex-1 w-full" id="main-content">
        {currentRoute === '/' && (
          <LandingPage onNavigate={navigate} onStartDemoRun={handleStartDemoRun} />
        )}
        {currentRoute === '/demo' && (
          <DemoConsole autoStart={triggerAutoStart} />
        )}
        {currentRoute === '/how-it-works' && (
          <HowItWorks />
        )}
        {currentRoute === '/builders' && (
          <BuildersPage />
        )}
      </main>

      {/* Standard Footer */}
      <Footer />
    </div>
  );
}
