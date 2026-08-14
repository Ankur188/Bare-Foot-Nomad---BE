module.exports = {
  apps: [
    {
      name: "barefootnomads",
      script: "index.js",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        PGHOST: "localhost",
        PGPORT: 5432,
        PGDATABASE: "postgres",
        PGUSER: "postgres",
        PGPASSWORD: "postgres",
        PGSSL: "false",
        AWS_BUCKET: "barefootnomads-images",
        AWS_REGION: "ap-south-1"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        PGHOST: "barefootnomads.ct8ak62u8dub.ap-south-1.rds.amazonaws.com",
        PGPORT: 5432,
        PGDATABASE: "postgres",
        PGUSER: "postgres",
        PGPASSWORD: "postgres",
        PGSSL: "true",
        AWS_BUCKET: "barefootnomads-images",
        AWS_REGION: "ap-south-1"
      }
    }
  ]
}