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
import AIAgents from './pages/services/AIAgents';
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
import TrafficAgentChat from './pages/TrafficAgentChat';
import { UserRoleProvider } from './lib/UserRoleContext';
import { ThemeProvider } from './lib/ThemeContext';
import { BrainWidgetWrapper } from './components/BrainWidgetWrapper';
import BrainManager from './pages/BrainManager';
import BrainTelemetry from './pages/BrainTelemetry';
import ResetPasswordHandler from './components/ResetPasswordHandler';
import SetPassword from './pages/SetPassword';
import DashboardLayout from './components/DashboardLayout';

const App: React.FC = () => {

  return (
    <UserRoleProvider>
      <ThemeProvider>
        <Router>
          <div className="relative min-h-screen bg-black">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/update-password" element={<SetPassword />} />
              <Route path="/p/:slug" element={<ProposalView />} />
              <Route path="/p/:slug/contract" element={<ContractView />} />
              <Route path="/contracts/:id" element={<ContractView />} />
              <Route path="/external/traffic-survey/:id" element={<TrafficSurvey />} />
              <Route path="/external/traffic-access/:id" element={<TrafficAccessForm />} />
              <Route path="/external/lp-survey/:id" element={<LandingPageSurvey />} />
              <Route path="/external/website-survey/:id" element={<WebsiteSurvey />} />
              <Route path="/external/access-guide/:id" element={<AccessGuideSurvey />} />

              {/* Protected Routes (Authenticated) */}
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional', 'comercial']}><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute allowedRoles={['gestor']}><DashboardLayout><Users /></DashboardLayout></ProtectedRoute>} />
              <Route path="/proposals/new" element={<ProtectedRoute allowedRoles={['gestor']}><DashboardLayout><CreateProposal /></DashboardLayout></ProtectedRoute>} />
              <Route path="/proposals" element={<ProtectedRoute allowedRoles={['gestor', 'comercial']}><DashboardLayout><Proposals /></DashboardLayout></ProtectedRoute>} />
              <Route path="/commercial-dashboard" element={<ProtectedRoute allowedRoles={['gestor', 'comercial']}><DashboardLayout><CommercialDashboard /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><Projects /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/traffic" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><TrafficManagement /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/traffic/strategy" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><StrategyMeeting /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/traffic/campaign/:campaignId/:stageId" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><CampaignStage /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/hosting" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><Hosting /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/lp" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><LandingPage /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/website" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><Website /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/ecommerce" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><Ecommerce /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/consulting" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><Consulting /></DashboardLayout></ProtectedRoute>} />
              <Route path="/projects/:id/ai-agents" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><AIAgents /></DashboardLayout></ProtectedRoute>} />
              <Route path="/meetings" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial', 'operacional']}><DashboardLayout><Meetings /></DashboardLayout></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial', 'operacional', 'leitor']}><DashboardLayout><Account /></DashboardLayout></ProtectedRoute>} />
              <Route path="/brain" element={<ProtectedRoute allowedRoles={['gestor']}><DashboardLayout><BrainManager /></DashboardLayout></ProtectedRoute>} />
              <Route path="/brain-telemetry" element={<ProtectedRoute allowedRoles={['gestor']}><DashboardLayout><BrainTelemetry /></DashboardLayout></ProtectedRoute>} />
              <Route path="/traffic-agent" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'operacional']}><DashboardLayout><TrafficAgentChat /></DashboardLayout></ProtectedRoute>} />
              <Route path="/client/preview/:acceptanceId" element={<ProtectedRoute allowedRoles={['admin', 'gestor']}><ClientDashboard /></ProtectedRoute>} />
              <Route path="/client" element={<ProtectedRoute allowedRoles={['cliente']}><ClientDashboard /></ProtectedRoute>} />
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
