module.exports = {
  apps: [
    {
      name: "barefootnomads",
      script: "index.js",
      env: {
        PORT: 3000,
        DB_HOST: "barefootnomads-db.cla2coy82741.ap-south-1.rds.amazonaws.com",
        DB_USER: "barefootNomads",
        DB_PASS: "BarefootNomads188",
        AWS_BUCKET: "barefootnomads-s3-bucket",
        AWS_REGION: "ap-south-1"
      },
        env_production: {
        PORT: 3000,
        DB_HOST: "barefootnomads-db.cla2coy82741.ap-south-1.rds.amazonaws.com",
        DB_USER: "barefootNomads",
        DB_PASS: "BarefootNomads188",
        AWS_BUCKET: "barefootnomads-s3-bucket",
        AWS_REGION: "ap-south-1"
      }
    }
  ]
}
