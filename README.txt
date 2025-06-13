AWS PIPELINE BUILDER PROJECT
===========================

Project Overview:
----------------
This is a web application for creating AWS CodePipeline pipelines easily through a user-friendly interface. 
It automates the creation of CI/CD pipelines with CodeBuild projects and proper IAM role configurations.

Project Structure:
-----------------
/home/ubuntu/projects/devops-experiments/
├── CLAUDE.md                   # Project instructions for AI assistant
└── aws-pipeline-builder/       # Main application directory
    ├── backend/                # Flask backend API
    │   ├── app.py             # Main backend server with pipeline creation logic
    │   ├── requirements.txt   # Python dependencies
    │   └── venv/             # Python virtual environment
    └── frontend/              # React frontend application
        ├── src/
        │   ├── App.tsx
        │   ├── components/
        │   │   └── PipelineForm.tsx  # Main form component
        │   └── types/
        │       └── Pipeline.ts       # TypeScript type definitions
        └── package.json

Key Features:
------------
1. Create multiple AWS CodePipeline pipelines in batch
2. Automatic CodeBuild project creation
3. Configurable environment variables
4. Support for GitHub repositories via CodeStar connections
5. Customizable IAM roles and build configurations

Important Configuration Details:
-------------------------------
- AWS Region: ap-south-1
- AWS Account: 465105616690
- Default IAM Roles:
  - CodePipeline: service-role/AWSCodePipelineServiceRole-ap-south-1-staging-mention
  - CodeBuild: service-role/codebuild-prod-api-build-service-role
- Available CodeStar Connections: github-connections, Geetanj, github-all-repos

Recent Updates (June 12, 2025):
------------------------------
1. Fixed CodeStar connection ARN retrieval - now properly fetches connection ARN from AWS instead of constructing it
2. Updated IAM role paths to include 'service-role/' prefix
3. Added error handling for existing pipelines
4. Enhanced frontend to show pipeline creation status
5. Successfully tested with LocoBuzz-Solutions-Pvt-Ltd/ServicesNG repository

How to Run:
----------
1. Backend (Flask):
   cd /home/ubuntu/projects/devops-experiments/aws-pipeline-builder/backend
   source venv/bin/activate
   python app.py

2. Frontend (React):
   cd /home/ubuntu/projects/devops-experiments/aws-pipeline-builder/frontend
   npm start

API Endpoints:
-------------
- POST /api/pipelines - Create new pipelines
- GET /api/pipelines - List existing pipelines
- GET /api/health - Health check

Test Pipeline Created:
--------------------
- Pipeline Name: test-locobuzz-services-pipeline
- Repository: LocoBuzz-Solutions-Pvt-Ltd/ServicesNG
- Branch: Milestone1

Notes:
-----
- The application requires AWS CLI to be configured with appropriate permissions
- CodeStar connections must be pre-configured in AWS console
- S3 buckets for artifacts are automatically created with timestamp suffix