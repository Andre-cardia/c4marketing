import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { UserRoleProvider } from './lib/UserRoleContext';
import { ThemeProvider } from './lib/ThemeContext';
import ResetPasswordHandler from './components/ResetPasswordHandler';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProposalView = lazy(() => import('./pages/ProposalView'));
const Users = lazy(() => import('./pages/Users'));
const CreateProposal = lazy(() => import('./pages/CreateProposal'));
const Proposals = lazy(() => import('./pages/Proposals'));
const CommercialDashboard = lazy(() => import('./pages/CommercialDashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const ContractView = lazy(() => import('./pages/ContractView'));
const TrafficManagement = lazy(() => import('./pages/services/TrafficManagement'));
const Hosting = lazy(() => import('./pages/services/Hosting'));
const LandingPage = lazy(() => import('./pages/services/LandingPage'));
const Website = lazy(() => import('./pages/services/Website'));
const Ecommerce = lazy(() => import('./pages/services/Ecommerce'));
const Consulting = lazy(() => import('./pages/services/Consulting'));
const AIAgents = lazy(() => import('./pages/services/AIAgents'));
const StrategyMeeting = lazy(() => import('./pages/services/traffic/StrategyMeeting'));
const CampaignStage = lazy(() => import('./pages/services/traffic/CampaignStage'));
const TrafficSurvey = lazy(() => import('./pages/external/TrafficSurvey'));
const TrafficAccessForm = lazy(() => import('./pages/external/TrafficAccessForm'));
const LandingPageSurvey = lazy(() => import('./pages/external/LandingPageSurvey'));
const WebsiteSurvey = lazy(() => import('./pages/external/WebsiteSurvey'));
const AccessGuideSurvey = lazy(() => import('./pages/external/AccessGuideSurvey'));
const Account = lazy(() => import('./pages/Account'));
const Meetings = lazy(() => import('./pages/Meetings'));
const ClientDashboard = lazy(() => import('./pages/client/ClientDashboard'));
const TrafficAgentChat = lazy(() => import('./pages/TrafficAgentChat'));
const BrainManager = lazy(() => import('./pages/BrainManager'));
const BrainTelemetry = lazy(() => import('./pages/BrainTelemetry'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const CRM = lazy(() => import('./pages/CRM'));
const CRMChat = lazy(() => import('./pages/CRMChat'));
const BrainWidgetWrapper = lazy(async () => ({
  default: (await import('./components/BrainWidgetWrapper')).BrainWidgetWrapper,
}));

function AppShellFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm">
        Carregando sistema...
      </div>
    </div>
  );
}

const App: React.FC = () => {

  return (
    <UserRoleProvider>
      <ThemeProvider>
        <Router>
          <div className="relative min-h-screen bg-neutral-950">
            <Suspense fallback={<AppShellFallback />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/recover-password" element={<SetPassword />} />
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
                <Route path="/proposals" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial']}><DashboardLayout><Proposals /></DashboardLayout></ProtectedRoute>} />
                <Route path="/crm" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial']}><DashboardLayout><CRM /></DashboardLayout></ProtectedRoute>} />
                <Route path="/crm-chat" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial']}><DashboardLayout><CRMChat /></DashboardLayout></ProtectedRoute>} />
                <Route path="/commercial-dashboard" element={<ProtectedRoute allowedRoles={['admin', 'gestor', 'comercial']}><DashboardLayout><CommercialDashboard /></DashboardLayout></ProtectedRoute>} />
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
                <Route path="/traffic-agent" element={<ProtectedRoute allowedRoles={['gestor']}><DashboardLayout><TrafficAgentChat /></DashboardLayout></ProtectedRoute>} />
                <Route path="/client/preview/:acceptanceId" element={<ProtectedRoute allowedRoles={['admin', 'gestor']}><ClientDashboard /></ProtectedRoute>} />
                <Route path="/client" element={<ProtectedRoute allowedRoles={['cliente']}><ClientDashboard /></ProtectedRoute>} />
              </Routes>
            </Suspense>

            <ResetPasswordHandler />
            <Suspense fallback={null}>
              <BrainWidgetWrapper />
            </Suspense>
          </div>
        </Router>
      </ThemeProvider>
    </UserRoleProvider>
  );
};

export default App;
