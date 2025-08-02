# Stock Bot Web Application

A full-stack platform for interacting with an automated stock-trading bot. The project is composed of three parts:

- **Frontend** – Next.js interface for users.
- **Backend** – Node/Express API layer.
- **Stock Bot** – Python service that runs trading logic.

## Prerequisites

- [Node.js](https://nodejs.org/) and npm
- [Python 3](https://www.python.org/)
- [Infisical CLI](https://infisical.com/docs/cli) for managing secrets

## Getting Started

Clone the repository and set up each component.

### Backend

```bash
cd backend
npm install
infisical init
npm run dev
```

### Frontend

```bash
cd frontend
npm install
infisical init
npm run dev
```

### Stock Bot Server

```bash
cd stockbot
setup_venv.bat   # run once to set up the virtual environment
run_dev.bat       # start the bot server and sets up virtual environment
```

> On non-Windows systems, run the equivalent shell scripts if provided or execute the Python modules directly.

## Project Structure

```text
backend/   - Express API server
frontend/  - Next.js web client
stockbot/  - Python trading bot service
```

## License

This project is provided as-is without warranty. See individual directories for more details.

