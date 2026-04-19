/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Topics = lazy(() => import('./pages/Topics'));
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph'));
const Reports = lazy(() => import('./pages/Reports'));
const ReviewConsole = lazy(() => import('./pages/ReviewConsole'));
const Settings = lazy(() => import('./pages/Settings'));
const DecisionSupport = lazy(() => import('./pages/DecisionSupport'));
const Tasks = lazy(() => import('./pages/Tasks'));

export default function App() {
  return (
    <Router>
      <Layout>
        <Suspense fallback={<div className="p-8 text-[#86868b]">加载中...</div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/graph" element={<KnowledgeGraph />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/review" element={<ReviewConsole />} />
            <Route path="/decision" element={<DecisionSupport />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  );
}
