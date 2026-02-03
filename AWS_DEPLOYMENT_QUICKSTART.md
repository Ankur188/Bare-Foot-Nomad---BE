# AWS Production Deployment - Quick Start Guide

This guide provides step-by-step instructions to deploy BarefootNomad from local development to AWS production environment.

## 📋 Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [AWS Resources Setup](#aws-resources-setup)
4. [Backend Deployment](#backend-deployment)
5. [Database Migration](#database-migration)
6. [Image Migration](#image-migration)
7. [Frontend Configuration](#frontend-configuration)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

---

## Overview

### Migration Path
```
┌─────────────────┐         ┌──────────────────┐
│ Local Dev       │  ──────► │ AWS Production   │
├─────────────────┤         ├──────────────────┤
│ • Node.js       │         │ • EC2 Instance   │
│ • PostgreSQL    │         │ • RDS PostgreSQL │
│ • Local Storage │         │ • S3 Bucket      │
└─────────────────┘         └──────────────────┘
```

### Architecture
```
Internet
   │
   ▼
┌──────────────┐
│   Netlify    │ (Frontend - Angular)
│   (CDN)      │
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     EC2      │────►│     RDS      │     │      S3      │
│  (Backend)   │     │ (PostgreSQL) │     │   (Images)   │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Prerequisites

### On Your Local Machine
- [ ] AWS Account with appropriate permissions
- [ ] AWS CLI installed and configured
- [ ] SSH client (PuTTY for Windows, or Terminal)
- [ ] PostgreSQL client (`psql`, `pg_dump`)
- [ ] Git repository access

### AWS Permissions Required
- EC2 (create, manage instances)
- RDS (create, manage databases)
- S3 (create buckets, upload objects)
- IAM (create roles, attach policies)
- VPC (security groups, if needed)

---

## AWS Resources Setup

### Step 1: Create RDS PostgreSQL Instance

#### Using AWS Console:
1. Navigate to **RDS** → **Create database**
2. Configuration:
   ```
   Engine: PostgreSQL 14 or later
   Template: Production (or Dev/Test for testing)
   DB Instance Identifier: barefootnomads-db
   Master Username: Choose a username (e.g., dbadmin)
   Master Password: Create a strong password
   DB Instance Class: db.t3.micro (testing) or db.t3.small (production)
   Storage: 20 GB General Purpose SSD (gp3)
   Multi-AZ: Yes (for production)
   VPC: Default or custom
   Public Access: No
   Database Name: barefootNomad
   ```
3. Click **Create database**
4. Wait 5-10 minutes for creation
5. **Save the endpoint**: `barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com`

#### Using AWS CLI:
```bash
aws rds create-db-instance \
  --db-instance-identifier barefootnomads-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username dbadmin \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20 \
  --db-name barefootNomad \
  --backup-retention-period 7 \
  --no-publicly-accessible \
  --region ap-south-1
```

### Step 2: Create S3 Bucket

#### Using AWS Console:
1. Navigate to **S3** → **Create bucket**
2. Configuration:
   ```
   Bucket name: barefootnomads-images
   Region: ap-south-1 (Mumbai)
   Block Public Access: Keep ALL settings CHECKED for now (we'll change this after)
   Versioning: Enable
   Encryption: Enable (SSE-S3)
   ```
3. Click **Create bucket**

4. **Disable Block Public Access** (IMPORTANT - Do this first):
   - Click on the bucket name `barefootnomads-images`
   - Go to **Permissions** tab
   - Scroll to **Block Public Access (bucket settings)**
   - Click **Edit**
   - **Uncheck** "Block all public access"
   - You can also uncheck individual settings if you prefer:
     - [ ] Block public access to buckets and objects granted through new access control lists (ACLs)
     - [ ] Block public access to buckets and objects granted through any access control lists (ACLs)
     - [ ] Block public access to buckets and objects granted through new public bucket or access point policies
     - [ ] Block public and cross-account access to buckets and objects through any public bucket or access point policies
   - Click **Save changes**
   - Type `confirm` when prompted
   - Wait a few seconds for changes to propagate

5. Configure **Bucket Policy**:
   - Still in **Permissions** tab → **Bucket Policy**
   - Click **Edit**
   - Paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::barefootnomads-images/*"
       }
     ]
   }
   ```
   - Click **Save changes**
   - You should see a warning banner: "This bucket has public access" - this is expected!

6. Configure **CORS**:
   - Still in **Permissions** tab
   - Scroll to **Cross-origin resource sharing (CORS)**
   - Click **Edit**
   - Paste:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedOrigins": [
         "https://barefootnomads.netlify.app",
         "http://localhost:4200"
   - Click **Save changes**

7. **Verify Setup**:
   - Upload a test image to verify public access works
   - Or wait until image migration step
       ],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

#### Using AWS CLI:
```bash
# Create bucket
aws s3 mb s3://barefootnomads-images --region ap-south-1

# Configure bucket policy (save JSON to policy.json first)
aws s3api put-bucket-policy \
  --bucket barefootnomads-images \
  --policy file://policy.json
```

### Step 3: Create IAM Role for EC2

#### Using AWS Console:
1. Navigate to **IAM** → **Roles** → **Create role**
2. Select **AWS service** → **EC2**
3. Attach policies:
   - Create custom policy for S3 access:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::barefootnomads-images",
           "arn:aws:s3:::barefootnomads-images/*"
         ]
       }
     ]
   }
   ```
4. Name: `BarefootNomad-EC2-Role`
5. Click **Create role**

### Step 4: Launch EC2 Instance

#### Using AWS Console:
1. Navigate to **EC2** → **Launch Instance**
2. Configuration:
   ```
   Name: BarefootNomad-Backend
   AMI: Amazon Linux 2023 or Ubuntu 22.04 LTS
   Instance type: t2.micro (free tier) or t3.small (production)
   Key pair: Create new or select existing
   Network: Default VPC
   Subnet: Public subnet
   Auto-assign Public IP: Enable
   
   Security Group Rules:
   - SSH (22) - Source: Your IP
   - HTTP (80) - Source: 0.0.0.0/0
   - HTTPS (443) - Source: 0.0.0.0/0
   - Custom TCP (3000) - Source: 0.0.0.0/0
   ```
3. Advanced details:
   - **IAM instance profile**: Select `BarefootNomad-EC2-Role`
4. Click **Launch instance**
5. **Save the Public IPv4**: Will need this for SSH and API calls

### Step 5: Configure RDS Security Group

1. Navigate to **EC2** → **Security Groups**
2. Find RDS security group (e.g., `rds-launch-wizard-xxx`)
3. Add inbound rule:
   ```
   Type: PostgreSQL (5432)
   Source: EC2 security group (sg-xxxxx)
   Description: Allow from EC2
   ```

---

## Backend Deployment

### Step 1: Connect to EC2

```bash
# Windows (using PowerShell or PuTTY)
ssh -i "your-key.pem" ec2-user@<EC2_PUBLIC_IP>

# Make sure key has correct permissions
icacls "your-key.pem" /inheritance:r
icacls "your-key.pem" /grant:r "%username%:R"
```

### Step 2: Initial EC2 Setup

```bash
# Download and run setup script
curl -O https://raw.githubusercontent.com/YOUR_REPO/setup-ec2.sh
chmod +x setup-ec2.sh
./setup-ec2.sh
```

Or manually:
```bash
# Update system
sudo yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install PostgreSQL client
sudo yum install -y postgresql15

# Install Git
sudo yum install -y git
```

### Step 3: Clone Repository

```bash
cd ~
git clone https://github.com/YOUR_REPO/Barefoot-Nomad-BE.git barefoot-nomad-be
cd barefoot-nomad-be
```

### Step 4: Install Dependencies

```bash
npm install --production
```

### Step 5: Configure Environment

```bash
# Create .env file
cp .env.production.example .env
nano .env
```

Update `.env` with your values:
```bash
NODE_ENV=production
PORT=3000

# Database (get from RDS)
PGHOST=barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com
PGPORT=5432
PGDATABASE=barefootNomad
PGUSER=dbadmin
PGPASSWORD=YOUR_RDS_PASSWORD
PGSSL=true

# AWS S3
AWS_REGION=ap-south-1
AWS_BUCKET_NAME=barefootnomads-images

# JWT (generate strong random string)
JWT_SECRET=your_very_long_and_random_secret_key_here

# CORS
ALLOWED_ORIGINS=https://barefootnomads.netlify.app,http://localhost:4200

# Netlify (if using)
NETLIFY_SIGNATURE_SECRET=your_netlify_secret
```

Save and exit: `Ctrl+X`, then `Y`, then `Enter`

### Step 6: Test Database Connection

```bash
node -e "import('./db.js').then(m => m.testConnection()).catch(console.error)"
```

Expected output:
```
✅ Connected to PostgreSQL database: barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com:5432
```

### Step 7: Start Application with PM2

```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list
pm2 save

# Configure PM2 to start on boot
pm2 startup
# Copy and run the command it displays

# Check status
pm2 status
pm2 logs barefootnomads --lines 50
```

### Step 8: Test API

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected output:
# {"status":"healthy","environment":"production",...}
```

---

## Database Migration

### Option 1: Using Migration Script

```bash
# On your local machine
cd "d:\Barefoot Nomad BE"

# Make script executable (Git Bash or WSL)
chmod +x migrate-db.sh

# Run migration
./migrate-db.sh
```

### Option 2: Manual Migration

```bash
# On local machine - Export database
pg_dump -U postgres -h localhost -d barefootNomad > backup.sql

# Transfer to EC2
scp -i your-key.pem backup.sql ec2-user@<EC2_IP>:~/

# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2_IP>

# Restore to RDS
PGPASSWORD='YOUR_RDS_PASSWORD' psql \
  -h barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com \
  -U dbadmin \
  -d barefootNomad \
  < backup.sql

# Verify
PGPASSWORD='YOUR_RDS_PASSWORD' psql \
  -h barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com \
  -U dbadmin \
  -d barefootNomad \
  -c "SELECT COUNT(*) FROM users;"
```

---

## Image Migration

### Option 1: Using Migration Script

```bash
# On your local machine
cd "d:\Barefoot Nomad BE"

# Configure AWS CLI
aws configure
# Enter:
# AWS Access Key ID
# AWS Secret Access Key
# Default region: ap-south-1
# Default output format: json

# Run migration
chmod +x migrate-images-to-s3.sh
./migrate-images-to-s3.sh
```

### Option 2: Manual Migration

```bash
# Sync local uploads to S3
aws s3 sync "./public/uploads/" "s3://barefootnomads-images/uploads/" \
  --region ap-south-1 \
  --acl public-read

# Verify
aws s3 ls s3://barefootnomads-images/uploads/ --region ap-south-1
```

---

## Frontend Configuration

### Update Environment File

Edit [d:\BarefootNomad-FE\src\environments\environment.prod.ts](d:\BarefootNomad-FE\src\environments\environment.prod.ts):

```typescript
export const environment = {
  production: true,
  apiURL: 'http://<EC2_PUBLIC_IP>:3000/api/'
  // Or use domain if you have one:
  // apiURL: 'https://api.barefootnomads.com/api/'
};
```

### Build and Deploy

```bash
cd d:\BarefootNomad-FE

# Build for production
npm run build

# Deploy to Netlify (if using Netlify CLI)
netlify deploy --prod --dir=dist/barefoot-nomad-fe
```

Or use Netlify UI to deploy the `dist/` folder.

---

## Testing

### Backend API Tests

```bash
# Health check
curl http://<EC2_PUBLIC_IP>:3000/health

# Test trips endpoint (adjust based on your API)
curl http://<EC2_PUBLIC_IP>:3000/api/trips/all
```

### Frontend Tests

1. Open https://barefootnomads.netlify.app
2. Test key features:
   - [ ] Homepage loads
   - [ ] Trips listing works
   - [ ] Images load from S3
   - [ ] User login/registration
   - [ ] Booking functionality
   - [ ] Image upload (admin)

### Database Tests

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2_IP>

# Connect to RDS
PGPASSWORD='YOUR_PASSWORD' psql \
  -h barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com \
  -U dbadmin \
  -d barefootNomad

# Run queries
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM trips;
\dt  -- List tables
\q   -- Quit
```

---

## Troubleshooting

### Backend won't start

```bash
# Check PM2 logs
pm2 logs barefootnomads

# Check .env file
cat .env

# Test database connection
node -e "import('./db.js').then(m => m.testConnection()).catch(console.error)"

# Restart application
pm2 restart barefootnomads
```

### Database connection fails

- Verify RDS security group allows EC2 security group
- Check `.env` has correct RDS endpoint
- Verify PGSSL=true is set
- Test with psql:
  ```bash
  PGPASSWORD='password' psql -h <RDS_ENDPOINT> -U dbadmin -d barefootNomad -c "SELECT 1"
  ```

### S3 upload fails

- Verify IAM role is attached to EC2
- Check AWS_BUCKET_NAME in `.env`
- Verify bucket policy allows public read
- Test AWS credentials:
  ```bash
  aws s3 ls s3://barefootnomads-images/
  ```

### CORS errors

- Update `.env` ALLOWED_ORIGINS
- Restart application: `pm2 restart barefootnomads`
- Check frontend is using correct API URL

### Images not loading

- Verify images were migrated to S3
- Check S3 bucket policy
- Verify image URLs in responses
- Check browser console for errors

---

## Useful Commands

```bash
# PM2 Commands
pm2 list                         # List all processes
pm2 logs barefootnomads          # View logs
pm2 restart barefootnomads       # Restart app
pm2 stop barefootnomads          # Stop app
pm2 delete barefootnomads        # Remove from PM2
pm2 monit                        # Monitor resources

# System Commands
df -h                            # Check disk space
free -m                          # Check memory
htop                             # Process monitor
sudo yum update -y               # Update packages

# Database Commands
# Connect to RDS
PGPASSWORD='password' psql -h <RDS> -U dbadmin -d barefootNomad

# AWS CLI Commands
aws s3 ls s3://barefootnomads-images/uploads/   # List S3 files
aws ec2 describe-instances                       # List EC2 instances
aws rds describe-db-instances                    # List RDS instances
```

---

## Next Steps

1. **Set up HTTPS**:
   - Use AWS ALB with ACM certificate, or
   - Install Nginx with Let's Encrypt on EC2

2. **Set up monitoring**:
   - Enable CloudWatch alarms
   - Set up log aggregation
   - Configure error notifications

3. **Implement CI/CD**:
   - GitHub Actions for automated deployment
   - Automated testing pipeline

4. **Performance optimization**:
   - Enable CloudFront CDN for static assets
   - Optimize database queries
   - Implement caching (Redis)

5. **Backup strategy**:
   - Automate RDS snapshots
   - Implement S3 lifecycle policies
   - Regular application backups

---

## Support

- AWS Documentation: https://docs.aws.amazon.com/
- PM2 Documentation: https://pm2.keymetrics.io/
- PostgreSQL Documentation: https://www.postgresql.org/docs/

For issues, check [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for detailed verification steps.
