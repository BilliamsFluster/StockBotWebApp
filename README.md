# Stock Bot Web Application

A comprehensive full-stack platform for automated stock trading with AI-powered assistance. The system combines modern web technologies with sophisticated trading algorithms and real-time market data integration.

## 🏗️ Architecture

The project consists of three interconnected services:

- **Frontend** – Next.js 15 with React 19 interface for users
- **Backend** – Node.js/Express API layer with MongoDB
- **StockBot** – Python FastAPI service for trading logic and AI

## ✨ Key Features

### 🤖 AI Assistant "Jarvis"
- Voice-enabled trading assistant with speech-to-text/text-to-speech
- Multiple AI providers (Ollama local models, HuggingFace)
- Real-time market analysis and trading recommendations
- WebSocket-based voice interaction

### 📊 Broker Integrations
- **Charles Schwab** - Full API integration with OAuth authentication
- **Alpaca Markets** - Paper and live trading support
- Real-time portfolio tracking and transaction history
- Secure credential management

### 💼 Trading Capabilities
- Multiple trading strategies (momentum, custom algorithms)
- Comprehensive backtesting engine
- Risk management with circuit breakers and exposure limits
- Paper trading simulation environment
- Real-time market data ingestion

## 🛠️ Prerequisites

### Required Software
- **Node.js** (v18 or higher) and npm
- **Python 3.8+** with pip
- **MongoDB** (local or cloud instance)
- **Infisical CLI** for secure environment management

### Optional (for AI features)
- **Ollama** for local AI models
- **CUDA-compatible GPU** for enhanced AI performance

## 🚀 Quick Start

### 1. Clone and Initial Setup
```bash
git clone https://github.com/BilliamsFluster/StockBotWebApp.git
cd StockBotWebApp
```

### 2. Install Infisical CLI
```bash
# Windows (using npm)
npm install -g @infisical/cli

# macOS (using Homebrew)
brew install infisical/get-cli/infisical

# Linux
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install infisical
```

### 3. Automated Setup (Windows)
```bash
# Starts all three services automatically
start-dev-all.bat
```

### 4. Manual Setup (All Platforms)

#### Backend Setup
```bash
cd backend
npm install
infisical init  # Follow prompts to connect to your Infisical project
npm run dev     # Starts on port 5001
```

#### Frontend Setup
```bash
cd frontend
npm install
infisical init  # Connect to Infisical project
npm run dev     # Starts on https://localhost:3000
```

#### StockBot Python Service
```bash
cd stockbot

# Windows
setup_venv.bat  # One-time setup
run_dev.bat     # Start the service

# macOS/Linux
python -m venv venv
source venv/bin/activate  # or `venv/bin/activate.fish` for fish shell
pip install --upgrade pip
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 5002
```

## 🔧 Configuration

### Environment Variables (Infisical)

The application uses Infisical for secure environment management. You'll need to configure the following variables:

#### Backend (.env)
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/stockbot
JWT_SECRET=your-jwt-secret-key

# Broker APIs
SCHWAB_CLIENT_ID=your-schwab-client-id
SCHWAB_CLIENT_SECRET=your-schwab-client-secret
SCHWAB_REDIRECT_URI=https://localhost:3000/schwab/callback

ALPACA_API_KEY=your-alpaca-api-key
ALPACA_SECRET_KEY=your-alpaca-secret-key
ALPACA_BASE_URL=https://paper-api.alpaca.markets  # or live URL

# Server Configuration
BACKEND_PORT=5001
BACKEND_HOST=0.0.0.0
```

#### Frontend (.env)
```bash
# API Endpoints
NEXT_PUBLIC_BACKEND_URL=https://localhost:5001
NEXT_PUBLIC_STOCKBOT_URL=http://localhost:5002

# SSL Certificates (for HTTPS development)
SSL_CERT=./certs/cert.crt
SSL_KEY=./certs/cert.key
SSL_CA=./certs/ca.crt

# Frontend Configuration
FRONTEND_PORT=3000
FRONTEND_HOST=0.0.0.0
```

#### StockBot (.env)
```bash
# AI Configuration
OLLAMA_BASE_URL=http://localhost:11434
HUGGINGFACE_API_TOKEN=your-huggingface-token

# Database
DATABASE_URL=sqlite:///./stockbot.db

# External APIs
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
```

### SSL Certificates Setup

The frontend runs on HTTPS for secure broker integrations. Generate certificates:

```bash
# Install mkcert (one-time setup)
npm install -g mkcert

# Create certificates
cd frontend/certs
mkcert -install
mkcert localhost 127.0.0.1 ::1

# Rename files
mv localhost+2.pem cert.crt
mv localhost+2-key.pem cert.key
```

### Broker API Setup

#### Charles Schwab
1. Register at [Schwab Developer Portal](https://developer.schwab.com/)
2. Create a new app with redirect URI: `https://localhost:3000/schwab/callback`
3. Add credentials to Infisical

#### Alpaca Markets
1. Sign up at [Alpaca Markets](https://alpaca.markets/)
2. Generate API keys from dashboard
3. Use paper trading URL for testing: `https://paper-api.alpaca.markets`

## 📁 Project Structure

```
StockBotWebApp/
├── backend/                 # Node.js/Express API
│   ├── controllers/         # Route handlers
│   ├── models/             # Database models
│   ├── routes/             # API routes
│   ├── config/             # Configuration files
│   └── middleware/         # Custom middleware
├── frontend/               # Next.js React application
│   ├── src/
│   │   ├── app/           # Next.js 13+ app directory
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── api/           # API client functions
│   │   └── types/         # TypeScript definitions
│   └── public/            # Static assets
└── stockbot/              # Python trading service
    ├── api/               # FastAPI routes and controllers
    ├── jarvis/            # AI assistant modules
    ├── ingestion/         # Data providers
    ├── strategy/          # Trading strategies
    ├── execution/         # Trade execution
    ├── backtest/          # Backtesting engine
    └── config/            # Configuration files
```

## 🌐 Service Endpoints

- **Frontend**: https://localhost:3000
- **Backend API**: https://localhost:5001
- **StockBot API**: http://localhost:5002
- **API Documentation**: http://localhost:5002/docs (FastAPI auto-generated)

## 🔍 Development Workflow

### Running Individual Services

```bash
# Backend only
cd backend && npm run dev

# Frontend only  
cd frontend && npm run dev

# StockBot only
cd stockbot && run_dev.bat  # Windows
cd stockbot && source venv/bin/activate && uvicorn server:app --reload --host 0.0.0.0 --port 5002  # macOS/Linux
```

### Database Setup

```bash
# MongoDB (if running locally)
mongod --dbpath /path/to/your/db

# The application will automatically create collections on first run
```

### AI Model Setup (Optional)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull recommended models
ollama pull llama2
ollama pull codellama
```

## 🧪 Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Python tests
cd stockbot && python -m pytest
```

## 🚨 Troubleshooting

### Common Issues

**Port Conflicts**
- Backend: Change `BACKEND_PORT` in Infisical
- Frontend: Change `FRONTEND_PORT` in Infisical  
- StockBot: Modify port in `run_dev.bat` or startup command

**SSL Certificate Issues**
```bash
# Regenerate certificates
cd frontend/certs
rm *.crt *.key
mkcert localhost 127.0.0.1 ::1
mv localhost+2.pem cert.crt
mv localhost+2-key.pem cert.key
```

**Python Dependencies**
```bash
# Clear and reinstall
cd stockbot
rm -rf venv
setup_venv.bat  # Windows
# or manual setup for macOS/Linux
```

**Database Connection**
- Ensure MongoDB is running
- Check `MONGODB_URI` in Infisical configuration
- Verify network connectivity

### Logs and Debugging

- **Backend logs**: Console output from `npm run dev`
- **Frontend logs**: Browser console and terminal output
- **StockBot logs**: FastAPI logs in terminal
- **Database logs**: MongoDB logs (if running locally)

## 📚 API Documentation

- **Backend API**: Available at runtime via route inspection
- **StockBot API**: Auto-generated docs at http://localhost:5002/docs
- **Frontend**: Component documentation in source files

## 🔐 Security Considerations

- All sensitive data managed through Infisical
- HTTPS enforced for frontend (required for broker OAuth)
- JWT-based authentication with secure token storage
- API rate limiting and CORS configuration
- Broker credentials encrypted at rest

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is provided as-is without warranty. See individual directories for specific licensing details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review logs for error messages
3. Ensure all prerequisites are installed
4. Verify Infisical configuration
5. Open an issue on GitHub with detailed error information

---

**⚠️ Important**: This software is for educational and development purposes. Always test thoroughly with paper trading before using real money. Trading involves risk of financial loss.
