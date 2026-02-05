import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ProposalView from './pages/ProposalView';
import Users from './pages/Users';
import CreateProposal from './pages/CreateProposal';
import Proposals from './pages/Proposals';
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
import LandingPageSurvey from './pages/external/LandingPageSurvey';
import ProtectedRoute from './components/ProtectedRoute';
import ProtectionRoute from './components/ProtectedRoute';
import { UserRoleProvider } from './lib/UserRoleContext';
import { ThemeProvider } from './lib/ThemeContext';

const App: React.FC = () => {
  return (
    <UserRoleProvider>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/p/:slug" element={<ProposalView />} />
            <Route path="/p/:slug/contract" element={<ContractView />} />
            <Route path="/contracts/:id" element={<ContractView />} />
            <Route path="/external/traffic-survey/:id" element={<TrafficSurvey />} />
            <Route path="/external/lp-survey/:id" element={<LandingPageSurvey />} />
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
                <ProtectedRoute>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/proposals/new"
              element={
                <ProtectedRoute>
                  <CreateProposal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/proposals"
              element={
                <ProtectedRoute>
                  <Proposals />
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
        </Router>
      </ThemeProvider>
    </UserRoleProvider>
  );
};

export default App;
