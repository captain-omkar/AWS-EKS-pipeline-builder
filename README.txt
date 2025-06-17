AWS PIPELINE BUILDER PROJECT
===========================

Project Overview:
----------------
This is a web application for creating AWS CodePipeline pipelines easily through a user-friendly interface. 
It automates the creation of CI/CD pipelines with CodeBuild projects and proper IAM role configurations.

Project Structure:
-----------------
/home/ubuntu/projects/devops-experiments/
├── CLAUDE.md                      # Project instructions for AI assistant
├── buildspec-template.json        # Template buildspec configuration
└── aws-pipeline-builder/          # Main application directory
    ├── backend/                   # Flask backend API
    │   ├── app.py                # Main backend server with pipeline creation logic (fully commented)
    │   ├── env_suggestions.json  # Persistent storage for environment variable suggestions
    │   ├── requirements.txt      # Python dependencies
    │   └── venv/                # Python virtual environment
    └── frontend/                 # React frontend application
        ├── src/
        │   ├── App.tsx           # Main app component with settings integration
        │   ├── components/
        │   │   ├── PipelineForm.tsx      # Main form for pipeline configuration (fully commented)
        │   │   ├── BuildspecEditor.tsx   # Modal for editing buildspec JSON
        │   │   ├── EnvVarInput.tsx      # Autocomplete input for environment variables
        │   │   └── Settings.tsx          # Settings modal for managing suggestions
        │   ├── types/
        │   │   └── Pipeline.ts           # TypeScript type definitions
        │   └── utils/
        │       └── buildspecTemplate.ts  # Default buildspec template generator
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

Recent Updates:
--------------
June 12, 2025:
1. Fixed CodeStar connection ARN retrieval - now properly fetches connection ARN from AWS instead of constructing it
2. Updated IAM role paths to include 'service-role/' prefix
3. Added error handling for existing pipelines
4. Enhanced frontend to show pipeline creation status
5. Successfully tested with LocoBuzz-Solutions-Pvt-Ltd/ServicesNG repository

January 16, 2025:
1. Added comprehensive inline buildspec editor with JSON syntax validation
2. Implemented environment variable autocomplete with customizable suggestions
3. Added Settings modal for managing environment variable suggestions
4. Created buildspec template for containerized applications with Docker and Kubernetes support
5. Added collapsible environment variables section for better UI organization
6. Implemented toggle between buildspec file path and inline buildspec content
7. Added comprehensive code comments throughout the entire codebase
8. Enhanced error handling and user feedback mechanisms

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

Technical Stack:
---------------
Backend:
- Flask (Python web framework)
- Boto3 (AWS SDK for Python)
- Flask-CORS (Cross-Origin Resource Sharing)
- PyYAML (YAML processing for buildspec)

Frontend:
- React with TypeScript
- Axios (HTTP client)
- Custom CSS with AWS-themed styling
- No external UI framework dependencies

New Features in Detail:
----------------------
1. **Buildspec Editor**:
   - JSON-based editor for inline buildspec configuration
   - Syntax validation and error handling
   - Pre-populated with comprehensive Docker build template
   - Modal interface with save/cancel functionality

2. **Environment Variable Autocomplete**:
   - Smart suggestions for common environment variables
   - Customizable suggestion lists per variable name
   - Keyboard navigation (arrow keys and Enter)
   - Click-outside to close dropdown

3. **Settings Management**:
   - Persistent storage of custom suggestions
   - Add/remove suggestions for each environment variable
   - Changes persist across server restarts
   - Accessible via floating settings icon

4. **Buildspec Template**:
   - Complete Docker containerization workflow
   - AWS CLI and kubectl installation
   - ECR authentication and image push
   - Kubernetes deployment with Helm
   - Secret management integration

Notes:
-----
- The application requires AWS CLI to be configured with appropriate permissions
- CodeStar connections must be pre-configured in AWS console
- S3 buckets for artifacts are automatically created with timestamp suffix
- All code is now fully documented with comprehensive comments
- Environment variable suggestions are stored in backend/env_suggestions.json