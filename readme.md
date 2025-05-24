# 🚀 Edit-Me: AI-Powered Code Sharing Platform

<div align="center">

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=flat&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
[![Terraform](https://img.shields.io/badge/terraform-%235835CC.svg?style=flat&logo=terraform&logoColor=white)](https://www.terraform.io/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Piston](https://img.shields.io/badge/Piston-Compiler-2ea44f)](https://emkc.org/)
[![Pollinations](https://img.shields.io/badge/Pollinations-AI-FF6B6B)](https://pollinations.ai/)


</div>

## 📝 Overview

Edit-Me is a cutting-edge code sharing platform that revolutionizes the way developers collaborate and learn. By integrating AI capabilities through Pollinations API and real-time code execution via Piston Compiler, we provide a seamless environment for code sharing, execution, and AI-assisted development.
![Screenshot (426)](https://github.com/user-attachments/assets/3f76dc36-f62c-4273-b6cc-60a516a806e6)
![Screenshot (427)](https://github.com/user-attachments/assets/61b1f378-1e30-4732-a5ad-1698244e0eb7)
![Screenshot (428)](https://github.com/user-attachments/assets/05663405-7800-4295-a5a5-3f71e52f9460)
![Screenshot (429)](https://github.com/user-attachments/assets/2d8efe9b-a054-4d8d-9d74-093c5f0e548a)
![Screenshot (431)](https://github.com/user-attachments/assets/fc5ec5cf-79e9-48fa-a38a-e7cd0336ce9b)
![Screenshot (432)](https://github.com/user-attachments/assets/213377c2-635e-49df-9ae8-a4343689c335)
![Screenshot (433)](https://github.com/user-attachments/assets/04d30197-d868-4a12-b578-40faac7af39f)
![Screenshot (434)](https://github.com/user-attachments/assets/a11b247e-8203-4346-b415-bcb9693c529c)
![Screenshot (434)](https://github.com/user-attachments/assets/ad956312-287b-4e43-91b0-fab3a7ffdd7c)

### 🌟 Key Features

- 🎨 **Modern UI/UX**
  - Responsive React-based interface
  - Real-time code editing
  - Syntax highlighting
  - Dark/Light theme support

- ⚡ **Code Execution**
  - Multi-language support via Piston API
  - Real-time compilation
  - Secure sandboxed environment
  - Custom runtime configurations

- 🤖 **AI Integration**
  - Code analysis and suggestions
  - Documentation generation
  - Bug detection and fixes
  - Code optimization via Pollinations API

- 🚀 **DevOps & Infrastructure**
  - Docker containerization
  - AWS cloud infrastructure
  - Terraform IaC
  - CI/CD pipeline
  - Automated testing

## 🏗️ System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │    Backend      │     │  Infrastructure │
│    (React)      │◄───►│   (Node.js)     │◄───►│    (AWS/TF)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                       ▲                        ▲
        │                       │                        │
        ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Browser  │     │   API Gateway   │     │  Cloud Services │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                       ▲                        ▲
        │                       │                        │
        ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Pollinations   │     │    Piston       │     │    Database     │
│     API         │     │   Compiler      │     │    (MongoDB)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 🛠️ Technology Stack

### Frontend 🎯
- **Core**: React.js 18.x
- **State Management**: React Context API + Redux Toolkit
- **Styling**: 
  - Tailwind CSS
  - CSS Modules
  - Flexbox/Grid
- **Build Tools**: 
  - Vite
  - ESLint
  - Prettier
- **Testing**: 
  - Jest
  - React Testing Library
- **Code Editor**: Monaco Editor
- **AI Integration**: Pollinations API Client

### Backend ⚙️
- **Runtime**: Node.js 18.x
- **Framework**: Express.js
- **Database**: 
  - MongoDB (Primary)
- **API**: 
  - RESTful Architecture
- **Real-time**: Socket.io
- **External Services**:
  - Piston API Integration
  - Pollinations API Integration

### DevOps 🚀
- **Containerization**: 
  - Docker
  - Docker Compose
- **Infrastructure**: 
  - AWS (EC2, S3, RDS)
- **IaC**: 
  - Terraform
- **CI/CD**: 
  - GitHub Actions
  - AWS CodePipeline


## 🚀 Getting Started

### Prerequisites 📋
- Node.js 18.x or later
- Docker Desktop
- AWS CLI configured
- Terraform CLI
- Git
- MongoDB (local or Atlas)

### Local Development Setup 💻

1. **Clone the Repository**
   ```bash
   git clone https://github.com/nradhesh/edit-me.git
   cd edit-me
   ```

2. **Install Dependencies**
   ```bash
   # Root dependencies
   npm install

   # Frontend setup
   cd client
   npm install

   # Backend setup
   cd ../server
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Copy environment files
   cp .env.example .env
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```

4. **Start Development Servers**
   ```bash
   # Using Docker Compose (recommended)
   docker-compose up -d

   # Or start services individually
   # Backend (from server directory)
   npm run dev

   # Frontend (from client directory)
   npm start
   ```

### Docker Deployment 🐳

```bash
# Build the image
docker build -t edit-me .

# Run the container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e MONGODB_URI=your_mongodb_uri \
  -e JWT_SECRET=your_jwt_secret \
  edit-me
```

### AWS Deployment ☁️

1. **Configure AWS Credentials**
   ```bash
   aws configure
   ```

2. **Deploy Infrastructure**
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

## 🔧 Environment Configuration

### Backend (.env)
```env
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
MONGODB_URI=mongodb://localhost:27017/edit-me

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
S3_BUCKET=your_s3_bucket

# API Keys
PISTON_API_KEY=your_piston_api_key
POLLINATIONS_API_KEY=your_pollinations_api_key

```

### Frontend (.env)
```env
# API Configuration
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=ws://localhost:3000

# AWS Configuration
REACT_APP_AWS_REGION=your_aws_region
REACT_APP_S3_BUCKET=your_s3_bucket
REACT_APP_CLOUDFRONT_URL=your_cloudfront_url

# External Services
REACT_APP_PISTON_API_URL=https://emkc.org/api/v2/piston
REACT_APP_POLLINATIONS_API_URL=https://api.pollinations.ai/v1

# Feature Flags
REACT_APP_ENABLE_AI=true
REACT_APP_ENABLE_CODE_EXECUTION=true
```

## 🎯 API Integration Details

### Piston API Integration
- **Purpose**: Secure code execution and compilation
- **Features**:
  - Multi-language support (Python, JavaScript, Java, C++, etc.)
  - Secure sandboxed execution
  - Real-time compilation
  - Custom runtime environments
  - Resource limits and timeouts
- **Security**:
  - Sandboxed execution environment
  - Resource usage monitoring
  - Network access restrictions
  - File system isolation

### Pollinations API Integration
- **Purpose**: AI-powered code assistance and optimization
- **Features**:
  - Code analysis and suggestions
  - Documentation generation
  - Bug detection and fixes
  - Code optimization
  - Natural language code queries
  - Code style recommendations
- **Security**:
  - API key authentication
  - Rate limiting
  - Data encryption
  - Privacy-focused processing

### 🧪 Testing
```bash
# Run all tests
npm test

# Run frontend tests
cd client && npm test

# Run backend tests
cd server && npm test

```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

