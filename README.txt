AWS PIPELINE BUILDER PROJECT
===========================

Project Overview:
----------------
This is a comprehensive web application for creating, managing, and deleting AWS CodePipeline pipelines 
with a user-friendly interface. It provides complete pipeline lifecycle management including creation, 
editing, deletion, and monitoring of AWS resources.

Project Structure:
-----------------
/home/ubuntu/projects/devops-experiments/
├── CLAUDE.md                          # Project instructions for AI assistant
├── buildspec-template.yml             # Template buildspec configuration (YAML format)
├── deployment.yml                     # Kubernetes deployment template
├── hpa.yml                           # Horizontal Pod Autoscaler template
├── kafka.yml                         # KEDA Kafka scaling template
└── aws-pipeline-builder/             # Main application directory
    ├── backend/                       # Flask backend API
    │   ├── app.py                    # Main backend server (1500+ lines, fully documented)
    │   ├── env_suggestions.json      # Environment variable autocomplete suggestions
    │   ├── pipeline_settings.json    # Pipeline configuration settings and dropdown options
    │   ├── pipeline_metadata.json    # Pipeline metadata and tracking information
    │   ├── manifest_template.yml     # Custom manifest template (if exists)
    │   ├── requirements.txt          # Python dependencies
    │   └── venv/                     # Python virtual environment
    └── frontend/                     # React frontend application
        ├── src/
        │   ├── App.tsx               # Main app component with routing
        │   ├── components/
        │   │   ├── PipelineForm.tsx          # Main pipeline creation/editing form
        │   │   ├── PipelineList.tsx          # Pipeline management dashboard with pagination
        │   │   ├── BuildspecEditor.tsx       # Modal for editing buildspec configuration
        │   │   ├── EnvVarInput.tsx          # Autocomplete input for environment variables
        │   │   ├── DeploymentConfig.tsx      # Deployment configuration modal
        │   │   ├── DeploymentConfigInline.tsx # Inline deployment configuration
        │   │   ├── ManifestTemplateEditor.tsx # Manifest template editor
        │   │   ├── ScalingConfig.tsx         # HPA and KEDA scaling configuration
        │   │   └── Settings.tsx              # Settings management modal
        │   ├── types/
        │   │   └── Pipeline.ts               # Comprehensive TypeScript type definitions
        │   └── utils/
        │       ├── buildspecTemplate.ts      # Default buildspec template generator
        │       ├── manifestTemplate.ts       # Kubernetes manifest generation
        │       └── scalingManifestTemplate.ts # Scaling manifest generation
        └── package.json

CURRENT FEATURE SET (Stable & Working):
======================================

Core Pipeline Management:
-------------------------
✅ Create new AWS CodePipeline pipelines with comprehensive configuration
✅ Manual approval stage between Source and Build stages for all pipelines
✅ Edit existing pipelines (branch, deployment config, appsettings, scaling)
✅ Delete pipelines with complete AWS resource cleanup (CodePipeline, CodeBuild, ECR, CodeCommit files)
✅ List all pipelines with metadata, pagination (20 per page), and search functionality
✅ Landing page with "Create New Pipeline" / "Edit Existing Pipeline" options

AWS Resource Integration:
------------------------
✅ ECR repository creation with image scanning enabled
✅ CodeBuild project creation with VPC support and environment variables
✅ S3 bucket creation for pipeline artifacts
✅ CodeCommit file management (appsettings.json and Kubernetes manifests)
✅ Complete resource cleanup on deletion (including ECR force delete)

Advanced Configuration:
----------------------
✅ Environment variable autocomplete with customizable suggestions
✅ Deployment configuration with editable dropdown options for:
   - Namespaces, App Types, Products, Node Groups, CPU/Memory limits, Service Accounts
✅ Scaling configuration (HPA and KEDA Kafka-based autoscaling)
✅ Service account configuration with conditional inclusion in manifests
✅ Buildspec editor (file path or inline YAML content)
✅ Appsettings management (upload new files or edit existing content from CodeCommit)

Settings & Customization:
------------------------
✅ Settings modal for managing all dropdown options and suggestions
✅ Pipeline settings configuration (AWS accounts, roles, connection names)
✅ Environment variable suggestions management
✅ Deployment options management (add/remove dropdown items)
✅ Persistent configuration storage across server restarts

UI/UX Features:
--------------
✅ Responsive design with proper error handling
✅ Real-time validation and feedback
✅ Collapsible sections for better organization
✅ Progress indicators and status messages
✅ Search and pagination for large pipeline lists (200+ pipelines supported)
✅ Edit mode with existing content loading and modification

Key Configuration Details:
-------------------------
- AWS Region: ap-south-1
- AWS Account ID: 465105616690
- ECR Registry: 465105616690.dkr.ecr.ap-south-1.amazonaws.com
- Default CodePipeline Role: staging-codepipeline-role
- Default CodeBuild Role: staging-serviceNGapi-codebuild-role
- CodeStar Connection: github-connections
- EKS Cluster: Staging_cluster
- Default Namespace: staging-locobuzz
- Default Repositories:
  - APPSETTINGS_REPO: modernization-appsettings-repo
  - MANIFEST_REPO: staging-repo

RECENT MAJOR UPDATES:
====================

June 23, 2025 - Comprehensive Feature Implementation:
----------------------------------------------------
1. ✅ FIXED: Pipeline editing issues (appsettings blinking, deployment config not saving)
2. ✅ IMPROVED: Pipeline deletion with robust file cleanup (handles any file structure)
3. ✅ ENHANCED: Complete pipeline lifecycle management
4. ✅ ADDED: Service account configuration with conditional manifest inclusion
5. ✅ IMPLEMENTED: Settings management for all deployment options
6. ✅ CREATED: Landing page with pipeline lifecycle management
7. ✅ BUILT: Comprehensive pipeline list with search and pagination
8. ✅ DEVELOPED: Complete scaling configuration (HPA and Kafka KEDA)
9. ✅ INTEGRATED: Full CodeCommit file management (appsettings and manifests)
10. ✅ ESTABLISHED: Robust error handling and resource cleanup

Key Technical Fixes:
-------------------
- Pipeline update endpoint now properly saves metadata changes
- Prevented repeated API calls causing UI flickering
- Fixed file deletion logic to handle any folder structure
- Improved useEffect dependencies to prevent unnecessary re-renders
- Enhanced error handling for missing files and resources

How to Run:
----------

Development Mode:
----------------
1. Backend (Flask):
   cd aws-pipeline-builder/backend
   source venv/bin/activate
   python app.py
   # Runs on http://localhost:5000

2. Frontend (React):
   cd aws-pipeline-builder/frontend
   npm start
   # Runs on http://localhost:3000

Production Mode with Docker:
---------------------------
1. Using Docker Compose (Recommended):
   cd aws-pipeline-builder
   docker-compose up -d
   # Frontend: http://localhost:3000
   # Backend: http://localhost:5000

2. Access the application:
   - Local: http://localhost:3000
   - Network: http://<your-server-ip>:3000
   - Public: http://<public-ip>:3000 (requires security group configuration)

Configuration Files:
-------------------
1. Backend Configuration:
   - backend/appsettings.json - Main configuration file
     * AWS credentials and region
     * CORS origins (add your server IPs/domains here)
     * DynamoDB settings
     * Git author information
   
   - backend/pipeline_settings.json - AWS service defaults
     * CodeBuild settings
     * CodePipeline roles
     * EKS cluster configuration
     * Repository defaults
   
   - backend/env_suggestions.json - Environment variable autocomplete

2. Frontend Configuration:
   - frontend/public/config.js - Development configuration
   - frontend/public/config.docker.js - Docker deployment configuration
   - Both files set the API_URL (dynamically uses current hostname)

3. Docker Configuration:
   - docker-compose.yml - Service definitions and port mappings
   - Volume mounts for configuration files
   - Network configuration

Deployment to Another Server:
-----------------------------
1. Prerequisites:
   - Docker and Docker Compose installed
   - Git installed
   - AWS credentials configured (IAM role or access keys)
   - Ports 3000 and 5000 available

2. Deployment Steps:
   ```bash
   # Clone the repository
   git clone <repository-url>
   cd devops-experiments/aws-pipeline-builder
   
   # Update backend configuration
   # Edit backend/appsettings.json:
   # - Add new server IPs to "cors_origins"
   # - Configure AWS credentials (or leave empty for IAM role)
   
   # Build and run with Docker Compose
   docker-compose build
   docker-compose up -d
   
   # Verify deployment
   curl http://<server-ip>:5000/api/health
   curl http://<server-ip>:3000
   ```

3. AWS IAM Permissions Required:
   - CodePipeline: Create, Update, Delete pipelines
   - CodeBuild: Create, Update, Delete projects
   - ECR: Create, Delete repositories, push/pull images
   - CodeCommit: Read, Write, Delete files
   - DynamoDB: Full access to pipeline metadata table
   - S3: Create buckets, read/write objects
   - IAM: PassRole permission for service roles

4. Security Considerations:
   - Update security groups to allow ports 3000 and 5000
   - Consider using HTTPS with a reverse proxy (nginx/Apache)
   - Use IAM roles instead of hardcoded credentials when possible
   - Restrict CORS origins to specific domains

5. Storage Requirements:
   - DynamoDB table (auto-created): aws-pipeline-builder-metadata
   - Stores pipeline metadata only for pipelines created through this tool
   - AWS pipelines are listed directly from AWS APIs

6. Environment-Specific Notes:
   - Frontend automatically adapts to the hostname used to access it
   - No need to rebuild images for different IPs/domains
   - Configuration changes require container restart:
     ```bash
     docker-compose restart backend  # For backend config changes
     docker-compose restart frontend # For frontend config changes
     ```

Complete API Endpoints:
----------------------
Pipeline Management:
- POST /api/pipelines - Create new pipelines
- GET /api/pipelines - List existing AWS pipelines
- POST /api/pipelines/<name>/update - Update existing pipeline
- DELETE /api/pipelines/<name>/delete - Delete pipeline and all resources
- GET /api/pipelines/<name>/appsettings - Get appsettings content from CodeCommit

Metadata Management:
- GET /api/pipeline-metadata - Get all pipeline metadata
- GET /api/pipeline-metadata/<name> - Get specific pipeline metadata
- POST /api/pipeline-metadata - Save/update pipeline metadata
- DELETE /api/pipeline-metadata/<name> - Delete pipeline metadata

Configuration:
- GET /api/env-suggestions - Get environment variable suggestions
- POST /api/env-suggestions - Update environment variable suggestions
- GET /api/pipeline-settings - Get pipeline configuration settings
- POST /api/pipeline-settings - Update pipeline configuration settings
- GET /api/health - Health check

File Structure Created by Application:
------------------------------------
CodeCommit Repositories:
- modernization-appsettings-repo/
  └── {pipeline-name}/
      └── appsettings.json

- staging-repo/
  └── {pipeline-name}/
      ├── {pipeline-name}.yml (main deployment manifest)
      ├── {pipeline-name}-hpa.yml (HPA scaling - if configured)
      └── {pipeline-name}-kafka.yml (KEDA Kafka scaling - if configured)

AWS Resources Created:
- CodePipeline: {pipeline-name}
- CodeBuild Project: {pipeline-name}-build
- ECR Repository: {pipeline-name}
- S3 Bucket: {pipeline-name}-artifacts-{timestamp}

Technical Stack:
---------------
Backend:
- Flask (Python web framework)
- Boto3 (AWS SDK for Python) 
- Flask-CORS (Cross-Origin Resource Sharing)
- PyYAML (YAML processing for buildspec)
- JSON file storage for metadata and settings

Frontend:
- React 18 with TypeScript
- React Router v6 for navigation
- Axios (HTTP client)
- Custom CSS with responsive design
- No external UI framework dependencies

IMPORTANT OPERATIONAL NOTES:
============================

Resource Management:
-------------------
- All AWS resources are properly cleaned up on pipeline deletion
- ECR repositories are force-deleted (including all Docker images)
- CodeCommit files are completely removed from both repositories
- S3 buckets and objects are cleaned up
- Pipeline metadata is removed from local storage

Error Handling:
--------------
- Graceful handling of existing resources (warns but continues)
- Robust file deletion (only deletes files that actually exist)
- Comprehensive error reporting for all operations
- Automatic retry logic for CodeCommit operations

Performance:
-----------
- Pagination support for 200+ pipelines
- Search functionality across all pipeline attributes
- Optimized API calls to prevent unnecessary requests
- Efficient state management to prevent UI flickering

Security:
--------
- AWS credentials must be configured via AWS CLI or IAM roles
- CodeStar connections must be pre-configured in AWS Console
- All API endpoints include proper error handling and validation
- Environment variables are properly sanitized and validated

Troubleshooting:
---------------
- If appsettings "blink", check for repeated API calls in browser console
- If deployment config doesn't save, verify the update endpoint is working
- If deletion fails, check AWS permissions for ECR, CodeCommit, and S3
- If environment variables don't populate, verify env_suggestions.json exists

Current Status: FULLY FUNCTIONAL & PRODUCTION READY
==================================================
The application is now stable and ready for production use with complete
pipeline lifecycle management, robust error handling, and comprehensive
feature set for AWS DevOps pipeline management.