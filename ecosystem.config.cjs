module.exports = {
  apps: [
    {
      name: "barefootnomads",
      script: "index.js",
      env: {
        PORT: 3000,
        DB_HOST: "barefootnomads-db.cl4ymqm82u3v.ap-south-1.rds.amazonaws.com",
        DB_USER: "barefootnomads",
        DB_PASS: "barefootnomads",
        AWS_BUCKET: "barefootnomads-images",
        AWS_REGION: "ap-south-1"
      },
        env_production: {
        PORT: 3000,
        DB_HOST: "barefootnomads-db.cl4ymqm82u3v.ap-south-1.rds.amazonaws.com",
        DB_USER: "barefootnomads",
        DB_PASS: "barefootnomads",
        AWS_BUCKET: "barefootnomads-images",
        AWS_REGION: "ap-south-1"
      }
    }
  ]
}