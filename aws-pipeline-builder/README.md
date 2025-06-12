# AWS Pipeline Builder

A web application for creating AWS CodePipeline configurations with a user-friendly interface.

## Architecture

- **Frontend**: React with TypeScript
- **Backend**: Python Flask with AWS SDK (boto3)

## Setup

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

## Features

- Create multiple pipelines in one go
- Configure pipeline parameters:
  - Pipeline name
  - Repository name
  - Branch name
  - Buildspec file path
  - Compute type
  - Environment variables
- Editable default configurations for AWS services
- Two-stage pipeline (Source + Build)

## AWS Prerequisites

1. AWS credentials configured (`aws configure`)
2. IAM roles:
   - CodePipeline service role
   - CodeBuild service role
3. CodeStar connection to GitHub
4. S3 permissions for artifact storage

## Usage

1. Start the backend server (runs on port 5000)
2. Start the frontend development server (runs on port 3000)
3. Navigate to http://localhost:3000
4. Fill in pipeline configurations
5. Click "Create Pipelines"

The application will create:
- CodeBuild projects
- S3 buckets for artifacts
- CodePipeline pipelines with Source and Build stages