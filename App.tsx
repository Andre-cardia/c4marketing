import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ProposalView from './pages/ProposalView';
import Users from './pages/Users';
import CreateProposal from './pages/CreateProposal';
import Proposals from './pages/Proposals';
import CommercialDashboard from './pages/CommercialDashboard';
import Projects from './pages/Projects';
import ContractView from './pages/ContractView';
import TrafficManagement from './pages/services/TrafficManagement';
import Hosting from './pages/services/Hosting';
import LandingPage from './pages/services/LandingPage';
import Website from './pages/services/Website';
import Ecommerce from './pages/services/Ecommerce';
import Consulting from './pages/services/Consulting';
import StrategyMeeting from './pages/services/traffic/StrategyMeeting';
import CampaignStage from './pages/services/traffic/CampaignStage';
import TrafficSurvey from './pages/external/TrafficSurvey';
import TrafficAccessForm from './pages/external/TrafficAccessForm';
import LandingPageSurvey from './pages/external/LandingPageSurvey';
import WebsiteSurvey from './pages/external/WebsiteSurvey';
import AccessGuideSurvey from './pages/external/AccessGuideSurvey';
import Account from './pages/Account';
import Meetings from './pages/Meetings';
import ProtectedRoute from './components/ProtectedRoute';
import ProtectionRoute from './components/ProtectedRoute'; // Duplicate import kept for safety
import AIAgent from './pages/AIAgent';
import { UserRoleProvider } from './lib/UserRoleContext';
import { ThemeProvider } from './lib/ThemeContext';
import { BrainChat } from './components/BrainChat';
import BrainManager from './pages/BrainManager';

const App: React.FC = () => {
  const [isBrainOpen, setIsBrainOpen] = React.useState(false);

  return (
    <UserRoleProvider>
      <ThemeProvider>
        <Router>
          <div className="relative min-h-screen">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/p/:slug" element={<ProposalView />} />
              <Route path="/p/:slug/contract" element={<ContractView />} />
              <Route path="/contracts/:id" element={<ContractView />} />
              <Route path="/projects/:id/consulting" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
              <Route path="/meetings" element={<ProtectedRoute><Meetings /></ProtectedRoute>} />
              <Route
                path="/ai-agent"
                element={
                  <ProtectedRoute allowedRoles={['gestor']}>
                    <AIAgent />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial', 'operacional', 'leitor']}>
                    <Account />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/brain"
                element={
                  <ProtectedRoute allowedRoles={['gestor']}>
                    <BrainManager />
                  </ProtectedRoute>
                }
              />
              <Route path="/external/traffic-survey/:id" element={<TrafficSurvey />} />
              <Route path="/external/traffic-access/:id" element={<TrafficAccessForm />} />
              <Route path="/external/lp-survey/:id" element={<LandingPageSurvey />} />
              <Route path="/external/website-survey/:id" element={<WebsiteSurvey />} />
              <Route path="/external/access-guide/:id" element={<AccessGuideSurvey />} />
              <Route
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial', 'operacional', 'leitor']}>
                    <Account />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={['gestor']}>
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/proposals/new"
                element={
                  <ProtectedRoute allowedRoles={['gestor']}>
                    <CreateProposal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/proposals"
                element={
                  <ProtectedRoute allowedRoles={['gestor']}>
                    <Proposals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/commercial-dashboard"
                element={
                  <ProtectedRoute allowedRoles={['gestor']}>
                    <CommercialDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects"
                element={
                  <ProtectedRoute>
                    <Projects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/traffic"
                element={
                  <ProtectedRoute>
                    <TrafficManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/traffic/strategy"
                element={
                  <ProtectedRoute>
                    <StrategyMeeting />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/traffic/campaign/:campaignId/:stageId"
                element={
                  <ProtectedRoute>
                    <CampaignStage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/hosting"
                element={
                  <ProtectedRoute>
                    <Hosting />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/lp"
                element={
                  <ProtectedRoute>
                    <LandingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/website"
                element={
                  <ProtectedRoute>
                    <Website />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/ecommerce"
                element={
                  <ProtectedRoute>
                    <Ecommerce />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/consulting"
                element={
                  <ProtectedRoute>
                    <Consulting />
                  </ProtectedRoute>
                }
              />
            </Routes>

            {/* Corporate Brain Widget */}
            <div className="fixed bottom-6 left-6 z-[60]">
              {!isBrainOpen && (
                <button
                  onClick={() => setIsBrainOpen(true)}
                  className="p-4 bg-slate-900 border border-slate-700 text-indigo-400 rounded-full shadow-2xl hover:scale-105 transition-all group flex items-center gap-0 overflow-hidden hover:pr-4 hover:w-auto w-14 h-14"
                  title="Segundo Cérebro"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6 shrink-0"
                  >
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                    <path d="M20.5 10c0-1.55-2.68-2.5-6-2.5-3.31 0-6 .95-6 2.5 0 1.07 1.32 1.84 3.73 2.15" />
                    <path d="M4 14c0 1.55 2.68 2.5 6 2.5 3.31 0 6-.95 6-2.5" />
                    <path d="M3.5 10C3.5 11.55 6.18 12.5 9.5 12.5c.34 0 .66-.01.99-.03" />
                    <path d="M10 22c-3.31 0-6-.95-6-2.5 0-1.55 2.68-2.5 6-2.5" />
                    <path d="M14 22c3.31 0 6-.95 6-2.5" />
                  </svg>
                  <span className="w-0 overflow-hidden group-hover:w-auto group-hover:ml-2 whitespace-nowrap text-sm font-bold opacity-0 group-hover:opacity-100 transition-all duration-300">
                    Cérebro
                  </span>
                </button>
              )}

              {isBrainOpen && (
                <div className="fixed bottom-6 left-6 w-[400px] h-[600px] shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[9999]">
                  <BrainChat onClose={() => setIsBrainOpen(false)} />
                </div>
              )}
            </div>

          </div>
        </Router>
      </ThemeProvider>
    </UserRoleProvider>
  );
};

export default App;
