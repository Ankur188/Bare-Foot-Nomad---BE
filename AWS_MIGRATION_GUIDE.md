# BarefootNomad AWS Migration Guide

## Current Architecture Analysis

### Frontend (BarefootNomad-FE)
- **Framework**: Angular 14
- **Current Deployment**: Netlify
- **Production API**: Already configured for EC2 (http://ec2-13-233-1-39.ap-south-1.compute.amazonaws.com:3000/api/)
- **Status**: ✅ Already configured for AWS backend

### Backend (Barefoot Nomad BE)
- **Framework**: Node.js + Express
- **Database**: PostgreSQL (currently local)
- **Image Storage**: Local filesystem (`public/uploads/`)
- **Current Setup**: Development mode with hardcoded credentials

### Database Schema
- Users, trips, batches, bookings tables
- UUID primary keys
- Relationships between trips and batches

---

## AWS Migration Plan

### 1. RDS PostgreSQL Setup

#### Step 1.1: Create RDS Instance
```bash
# Using AWS CLI or Console
- Database engine: PostgreSQL 14+
- Instance class: db.t3.micro (for testing) or db.t3.small (production)
- Storage: 20 GB General Purpose SSD
- Multi-AZ: Yes (for production)
- Public accessibility: No (access via EC2 only)
- VPC: Same as EC2 instance
- Security group: Allow PostgreSQL (5432) from EC2 security group
```

#### Step 1.2: Database Configuration
- **Endpoint**: Will be provided after creation (e.g., `barefootnomads-db.xxxxx.ap-south-1.rds.amazonaws.com`)
- **Port**: 5432
- **Database name**: barefootNomad
- **Master username**: Choose a secure username
- **Password**: Use a strong password (store in AWS Secrets Manager)

#### Step 1.3: Migrate Database
```bash
# Export local database
pg_dump -U postgres -d barefootNomad > barefootNomad_backup.sql

# Import to RDS (from EC2 or bastion host)
psql -h <RDS_ENDPOINT> -U <MASTER_USER> -d barefootNomad < barefootNomad_backup.sql
```

---

### 2. S3 Bucket Setup

#### Step 2.1: Create S3 Bucket
```bash
# Bucket name: barefootnomads-images
# Region: ap-south-1 (Mumbai)
# Block public access: OFF (configure specific public read)
# Versioning: Enabled (recommended)
# Encryption: Enabled (AES-256)
```

#### Step 2.2: Bucket Policy
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

#### Step 2.3: CORS Configuration
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": [
      "https://barefootnomads.netlify.app",
      "http://localhost:4200"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

### 3. EC2 Instance Setup

#### Step 3.1: Launch EC2 Instance
```bash
# AMI: Amazon Linux 2023 or Ubuntu 22.04 LTS
# Instance type: t2.micro (free tier) or t3.small (production)
# VPC: Default or custom VPC
# Subnet: Public subnet with internet gateway
# Security group:
#   - SSH (22) from your IP
#   - HTTP (80) from anywhere
#   - HTTPS (443) from anywhere
#   - Custom TCP (3000) from anywhere (or restrict to load balancer)
```

#### Step 3.2: Install Node.js
```bash
# For Amazon Linux 2023
sudo yum update -y
sudo yum install -y nodejs npm git

# For Ubuntu
sudo apt update
sudo apt install -y nodejs npm git

# Verify installation
node --version
npm --version
```

#### Step 3.3: Install PM2
```bash
sudo npm install -g pm2

# Configure PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

#### Step 3.4: Install PostgreSQL Client (for database access)
```bash
# Amazon Linux
sudo yum install -y postgresql15

# Ubuntu
sudo apt install -y postgresql-client
```

---

### 4. IAM Role for EC2

#### Step 4.1: Create IAM Role
- **Role name**: BarefootNomad-EC2-Role
- **Trust relationship**: EC2
- **Policies**:
  - `AmazonS3FullAccess` (or custom policy with specific bucket access)
  - `AmazonSSMReadOnlyAccess` (for Parameter Store, optional)

#### Step 4.2: Custom S3 Policy (Recommended)
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

#### Step 4.3: Attach Role to EC2
- Navigate to EC2 instance
- Actions → Security → Modify IAM Role
- Select BarefootNomad-EC2-Role
- Save

---

## Implementation Steps

### Phase 1: Backend Configuration (Files to Create/Update)

1. **Create `.env.production` file** (see .env.production.example)
2. **Update db.js** to use environment variables properly
3. **Create S3 service** for image uploads
4. **Update images.js route** to use S3 instead of local storage
5. **Create deployment scripts**

### Phase 2: Deploy to EC2

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>

# Clone repository
git clone <YOUR_REPO_URL>
cd Barefoot\ Nomad\ BE

# Install dependencies
npm install

# Create .env file with production values
nano .env

# Start application with PM2
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### Phase 3: Frontend Configuration

1. **Update environment.prod.ts** with correct EC2 endpoint
2. **Rebuild Angular app**: `npm run build`
3. **Deploy to Netlify** (already configured)

### Phase 4: Database Migration

```bash
# From your local machine (or from EC2 via bastion)
pg_dump -U postgres -d barefootNomad -h localhost > backup.sql

# Transfer to EC2
scp -i your-key.pem backup.sql ec2-user@<EC2_IP>:~/

# SSH to EC2 and restore
ssh -i your-key.pem ec2-user@<EC2_IP>
psql -h <RDS_ENDPOINT> -U <DB_USER> -d barefootNomad < backup.sql
```

### Phase 5: Migrate Images to S3

```bash
# Use AWS CLI or create a migration script
aws s3 sync ./public/uploads/ s3://barefootnomads-images/uploads/ --acl public-read
```

---

## Security Best Practices

### 1. Environment Variables
- ✅ Use `.env` file for all secrets
- ✅ Never commit `.env` to git
- ✅ Use AWS Secrets Manager or Parameter Store for production

### 2. Database Security
- ✅ Use strong passwords
- ✅ Enable SSL/TLS for RDS connections
- ✅ Restrict RDS security group to EC2 only
- ✅ Regular automated backups

### 3. S3 Security
- ✅ Use IAM roles instead of access keys
- ✅ Enable versioning
- ✅ Enable encryption at rest
- ✅ Configure lifecycle policies

### 4. EC2 Security
- ✅ Keep SSH port (22) restricted to your IP
- ✅ Regular security updates
- ✅ Use Application Load Balancer with HTTPS
- ✅ Implement rate limiting

### 5. Application Security
- ✅ Remove hardcoded credentials
- ✅ Implement proper authentication
- ✅ Use HTTPS only
- ✅ Implement CORS properly
- ✅ Add helmet.js security headers

---

## Estimated Costs (ap-south-1 region)

### Development/Testing
- EC2 t2.micro: $0.0116/hour (~$8.50/month)
- RDS db.t3.micro: $0.018/hour (~$13/month)
- S3 Storage: $0.023/GB (~$0.50/month for 20GB)
- Data Transfer: ~$5/month
- **Total**: ~$27/month

### Production
- EC2 t3.small: $0.0208/hour (~$15/month)
- RDS db.t3.small: $0.036/hour (~$26/month)
- S3 Storage: $0.023/GB (~$2/month for 100GB)
- Data Transfer: ~$15/month
- **Total**: ~$58/month

*Note: Consider using AWS Free Tier for 12 months if eligible*

---

## Monitoring and Maintenance

### CloudWatch Metrics
- EC2 CPU, memory, disk usage
- RDS connections, CPU, storage
- S3 request metrics

### Logging
- Application logs via PM2: `pm2 logs`
- RDS logs in CloudWatch
- S3 access logs

### Backup Strategy
- RDS automated backups (7-day retention)
- S3 versioning enabled
- Database snapshots before major updates

---

## Rollback Plan

1. Keep local setup running during initial deployment
2. Test all features on AWS before switching DNS
3. Monitor for 24-48 hours
4. Keep RDS snapshots for quick rollback
5. Document any issues encountered

---

## Next Steps

1. ✅ Review this guide
2. ⏳ Create AWS resources (RDS, S3, EC2)
3. ⏳ Update backend code with provided files
4. ⏳ Deploy to EC2
5. ⏳ Migrate database
6. ⏳ Migrate images to S3
7. ⏳ Update frontend configuration
8. ⏳ Test all functionality
9. ⏳ Monitor and optimize
