import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <div className="landing-header">
        <h1>LocoBuzz Pipeline Builder</h1>
        <p className="landing-subtitle">Create and manage your CI/CD pipelines with ease</p>
      </div>

      <div className="landing-cards">
        <div className="landing-card" onClick={() => navigate('/create')}>
          <div className="card-icon">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
          </div>
          <h2>Create New Pipeline</h2>
          <p>Set up a new CI/CD pipeline with automated deployments to AWS</p>
          <div className="card-features">
            <ul>
              <li>Configure CodePipeline</li>
              <li>Set up CodeBuild projects</li>
              <li>Create ECR repositories</li>
              <li>Deploy to EKS</li>
            </ul>
          </div>
          <button className="card-button">Get Started</button>
        </div>

        <div className="landing-card" onClick={() => navigate('/pipelines')}>
          <div className="card-icon">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
          <h2>Edit Existing Pipeline</h2>
          <p>Manage and update your existing pipelines and configurations</p>
          <div className="card-features">
            <ul>
              <li>Update configurations</li>
              <li>Modify deployment settings</li>
              <li>Change branches</li>
              <li>Delete pipelines</li>
            </ul>
          </div>
          <button className="card-button">View Pipelines</button>
        </div>
      </div>

      <div className="landing-footer">
        <button className="settings-float-btn" onClick={() => navigate('/settings')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 1v6m0 6v6m11-11h-6m-6 0H1"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default LandingPage;