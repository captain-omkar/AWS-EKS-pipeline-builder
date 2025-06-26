# Docker Setup for AWS Pipeline Builder

## Quick Start

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd aws-pipeline-builder
```

2. **Configure AWS credentials in appsettings.json**
```bash
# Edit backend/appsettings.json and add your AWS credentials
# OR mount your ~/.aws directory (see docker-compose.yml)
```

3. **Build and run with Docker Compose**
```bash
docker-compose up --build
```

4. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Configuration

### Backend Configuration
Edit `backend/appsettings.json`:
```json
{
  "aws": {
    "credentials": {
      "access_key_id": "YOUR_AWS_KEY",
      "secret_access_key": "YOUR_AWS_SECRET"
    }
  }
}
```

### Frontend Configuration
The frontend uses `frontend/public/config.docker.js` for Docker deployments.
This file points to the backend service using Docker's internal networking.

## AWS Credential Options

### Option 1: Credentials in appsettings.json
Add your AWS credentials to `backend/appsettings.json` as shown above.

### Option 2: Mount AWS credentials directory
The docker-compose.yml is configured to mount `~/.aws` directory.
Ensure you have AWS CLI configured on your host machine.

### Option 3: Environment variables
Add to docker-compose.yml:
```yaml
backend:
  environment:
    - AWS_ACCESS_KEY_ID=your_key
    - AWS_SECRET_ACCESS_KEY=your_secret
```

### Option 4: IAM Role (EC2/ECS)
If running on AWS infrastructure, the instance profile will be used automatically.

## Persistent Data

The following files are mounted as volumes to persist data:
- `pipeline_settings.json` - Pipeline configuration settings
- `pipeline_metadata.json` - Created pipeline metadata
- `env_suggestions.json` - Environment variable suggestions
- `appsettings.json` - Application configuration

## Troubleshooting

### Backend won't start
- Check AWS credentials in appsettings.json
- Verify all JSON files are valid
- Check logs: `docker-compose logs backend`

### Frontend can't connect to backend
- Ensure both services are running: `docker-compose ps`
- Check backend is accessible: `curl http://localhost:5000/api/health`
- Verify config.docker.js is properly mounted

### Permission issues
- Ensure configuration files have proper permissions
- On Linux: `chmod 644 backend/*.json`

## Development

To make changes and rebuild:
```bash
# Rebuild specific service
docker-compose build backend
docker-compose build frontend

# Rebuild and restart everything
docker-compose up --build

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Production Deployment

For production, consider:
1. Using environment-specific config files
2. Implementing proper secrets management
3. Using managed services (RDS, DynamoDB) for data persistence
4. Setting up proper logging and monitoring
5. Using HTTPS with proper certificates