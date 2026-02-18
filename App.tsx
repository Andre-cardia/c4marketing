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
import ClientDashboard from './pages/client/ClientDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import ProtectionRoute from './components/ProtectedRoute'; // Duplicate import kept for safety
import AIAgent from './pages/AIAgent';
import { UserRoleProvider } from './lib/UserRoleContext';
import { ThemeProvider } from './lib/ThemeContext';
import { BrainWidgetWrapper } from './components/BrainWidgetWrapper';
import BrainManager from './pages/BrainManager';
import ResetPasswordHandler from './components/ResetPasswordHandler';

const App: React.FC = () => {

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
              <Route path="/projects/:id/consulting" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><Projects /></ProtectedRoute>} />
              <Route path="/meetings" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial', 'operacional']}><Meetings /></ProtectedRoute>} />
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
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional', 'comercial']}>
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
                  <ProtectedRoute allowedRoles={['gestor', 'comercial']}>
                    <Proposals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/commercial-dashboard"
                element={
                  <ProtectedRoute allowedRoles={['gestor', 'comercial']}>
                    <CommercialDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <Projects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/traffic"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <TrafficManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/traffic/strategy"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <StrategyMeeting />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/traffic/campaign/:campaignId/:stageId"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <CampaignStage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/hosting"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <Hosting />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/lp"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <LandingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/website"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <Website />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/ecommerce"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <Ecommerce />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:id/consulting"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}>
                    <Consulting />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/client/preview/:acceptanceId"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'gestor']}>
                    <ClientDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/client"
                element={
                  <ProtectedRoute allowedRoles={['cliente']}>
                    <ClientDashboard />
                  </ProtectedRoute>
                }
              />
            </Routes>

            <ResetPasswordHandler />
            <BrainWidgetWrapper />
          </div>
        </Router>
      </ThemeProvider>
    </UserRoleProvider>
  );
};

export default App;
