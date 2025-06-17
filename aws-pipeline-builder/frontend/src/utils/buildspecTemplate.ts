/**
 * Buildspec Template Utility
 * 
 * Provides default AWS CodeBuild buildspec configurations for pipeline creation.
 * This template includes standard phases and commands for building and deploying
 * containerized applications to AWS EKS.
 * 
 * The template covers:
 * - Installation of required tools (kubectl, jq, unzip)
 * - AWS ECR login and authentication
 * - Docker image building and tagging
 * - Kubernetes deployment
 * - Secret management integration
 * 
 * @module buildspecTemplate
 */

import { BuildspecConfig } from '../types/Pipeline';

/**
 * Returns a default buildspec configuration object
 * 
 * This function provides a comprehensive buildspec template that includes:
 * - Install phase: Sets up kubectl and other required tools
 * - Pre-build phase: Handles ECR login and secret retrieval
 * - Build phase: Builds Docker images and manages configuration
 * - Post-build phase: Pushes images to ECR and deploys to Kubernetes
 * 
 * The template uses environment variables for configuration:
 * - SMCREDS: AWS Secrets Manager secret ID
 * - SERVICE_NAME: Name of the service being built
 * - ECR_REPO_URI: ECR repository URI
 * - APPSETTINGS_REPO: CodeCommit repo for application settings
 * - MANIFEST_REPO: CodeCommit repo for Kubernetes manifests
 * - CLUSTER_ROLE_ARN: IAM role for kubectl operations
 * 
 * @returns {BuildspecConfig} A complete buildspec configuration object
 */
export const getDefaultBuildspec = (): BuildspecConfig => ({
  version: 0.2,
  phases: {
    // Installation phase - sets up required tools and dependencies
    install: {
      commands: [
        // Install JSON processor and unzip utility
        'yum install -y jq unzip',
        // Download kubectl binary from AWS S3
        'curl -O https://s3.us-west-2.amazonaws.com/amazon-eks/1.24.10/2023-01-30/bin/linux/amd64/kubectl',
        // Make kubectl executable
        'chmod +x ./kubectl',
        // Move kubectl to bin directory and add to PATH
        'mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$PATH:$HOME/bin'
      ]
    },
    // Pre-build phase - authentication and secret retrieval
    pre_build: {
      commands: [
        'echo Logging in to Amazon ECR...',
        // Display AWS CLI version for debugging
        'aws --version',
        // Login to ECR using AWS credentials
        'aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 465105616690.dkr.ecr.ap-south-1.amazonaws.com',
        // Set kubeconfig path for kubectl
        'export KUBECONFIG=$HOME/.kube/config',
        // Retrieve database credentials from AWS Secrets Manager
        'aws secretsmanager get-secret-value --secret-id $SMCREDS --query \'SecretString\' --output text > Database.json'
      ]
    },
    // Build phase - main build and configuration steps
    build: {
      commands: [
        'echo Build started on `date`',
        // Extract image tag from CodeBuild build ID
        'IMAGE_TAG=$(echo $CODEBUILD_BUILD_ID | awk -F":" \'{print $2}\')',
        // Set target directory, default to current directory
        'TARGET_DIR=${REPO_DIR:-.}',
        'echo "✅ Using SERVICE_NAME=$SERVICE_NAME"',
        'echo "✅ Using TARGET_DIR=$TARGET_DIR"',
        'echo "✅ Cloning appsettings repo..."',
        // Assume role for kubectl operations
        'CREDENTIALS=$(aws sts assume-role --role-arn $CLUSTER_ROLE_ARN --role-session-name codebuild-kubectl --duration-seconds 900)',
        // Export assumed role credentials
        'export AWS_ACCESS_KEY_ID="$(echo ${CREDENTIALS} | jq -r \'.Credentials.AccessKeyId\')"',
        'export AWS_SECRET_ACCESS_KEY="$(echo ${CREDENTIALS} | jq -r \'.Credentials.SecretAccessKey\')"',
        'export AWS_SESSION_TOKEN="$(echo ${CREDENTIALS} | jq -r \'.Credentials.SessionToken\')"',
        // Configure git for AWS CodeCommit
        'git config --global credential.helper \'!aws codecommit credential-helper $@\'',
        'git config --global credential.UseHttpPath true',
        // Clone application settings repository
        'git clone https://git-codecommit.ap-south-1.amazonaws.com/v1/repos/$APPSETTINGS_REPO',
        // Copy service-specific settings to target directory
        'cp $APPSETTINGS_REPO/$SERVICE_NAME/appsettings.json $TARGET_DIR/',
        // Alternative S3-based approach (commented out)
        '#- echo "✅ Downloading appsettings.json from S3..."',
        '#- aws s3 ls s3://eks-manifest-loco/appsettings/$SERVICE_NAME/',
        '#- aws s3 cp s3://eks-manifest-loco/appsettings/$SERVICE_NAME/appsettings.json $TARGET_DIR/',
        // List target directory contents for verification
        'ls -R $TARGET_DIR',
        'echo "✅ Replacing placeholders dynamically..."',
        // Replace placeholders in appsettings.json with values from secrets
        `for key in $(jq -r 'keys[]' Database.json); do
  value=$(jq -r --arg k "$key" '.[$k]' Database.json)
  echo "Replacing $key with $value"
  sed -i "s|$key|$value|g" $TARGET_DIR/appsettings.json
done`,
        // Display final configuration for verification
        'echo "✅ Final appsettings.json:"',
        'cat $TARGET_DIR/appsettings.json',
        'echo "✅ Building Docker image..."',
        // Build Docker image using service-specific Dockerfile
        'docker build -t $SERVICE_NAME -f $TARGET_DIR/Dockerfile .',
        // Tag image with ECR repository URI and build-specific tag
        'docker tag $SERVICE_NAME:latest $ECR_REPO_URI:$IMAGE_TAG'
      ]
    },
    // Post-build phase - push image and deploy to Kubernetes
    post_build: {
      commands: [
        'echo Build completed on `date`',
        'echo Pushing the Docker image...',
        // Push tagged image to ECR
        'docker push $ECR_REPO_URI:$IMAGE_TAG',
        'echo Writing image definitions file...',
        // Display repository and branch information
        'echo "$Repository_Name-$Branch_Name"',
        'echo "✅ Assume role for kubectl..."',
        // Clone Kubernetes manifests repository
        'git clone https://git-codecommit.ap-south-1.amazonaws.com/v1/repos/$MANIFEST_REPO',
        // Navigate to manifests directory
        'cd $MANIFEST_REPO/manifests/',
        // List manifest files
        'ls',
        // Configure kubectl for EKS cluster
        'aws eks update-kubeconfig --name Staging_cluster',
        // Update manifest with new image tag
        'sed -i "s/latest/$IMAGE_TAG/g" $SERVICE_NAME.yml',
        // Display updated manifest for verification
        'cat $SERVICE_NAME.yml',
        // Apply Kubernetes manifest to deploy/update service
        'kubectl apply -f $SERVICE_NAME.yml'
      ]
    }
  }
});