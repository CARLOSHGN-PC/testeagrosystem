// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Get a free hosted Postgres database in seconds: `npx create-db`

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Company {
  id        String   @id @default(cuid())
  name      String
  code      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String

  role         Role     @default(USER)

  companyId    String
  company      Company  @relation(fields: [companyId], references: [id])

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

enum Role {
  ADMIN
  MANAGER
  USER
}