# Estate Inspection - Croydon

A web application for managing estate inspections for Croydon Council.

## Project Overview

This application facilitates the recording, tracking, and management of estate inspections across Croydon Council properties.

## Features

- Estate inspection recording
- Inspection data management
- Reporting and analytics
- User management

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git
- Vercel account (for database)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/SueEdgerley/Estate-Inspection-Croydon.git
cd Estate-Inspection-Croydon
```

2. Install dependencies:
```bash
npm install
```

3. Set up Vercel Postgres:
   - See [VERCEL_SETUP.md](./VERCEL_SETUP.md) for detailed instructions
   - Create a Postgres database in your Vercel dashboard
   - Environment variables will be automatically configured

4. For local development, pull environment variables:
```bash
npm i -g vercel
vercel link
vercel env pull .env.local
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Project Structure

```
Estate-Inspection-Croydon/
├── app/              # Next.js App Router directory
│   ├── components/   # React components
│   ├── styles/      # Global styles
│   ├── layout.js    # Root layout
│   └── page.js      # Home page
├── backend/          # Backend API (if applicable)
├── docs/            # Documentation
├── public/          # Static assets
├── next.config.js   # Next.js configuration
└── README.md        # This file
```

## Development

### Running the Application

- Development mode: `npm run dev` (runs on http://localhost:3000)
- Production build: `npm run build`
- Start production server: `npm start`
- Run linter: `npm run lint`

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **React**: 18.2.0
- **Database**: Vercel Postgres
- **Styling**: CSS Modules / Global CSS

## Data Storage

This application uses **Vercel Postgres** to store issues data. Data is stored server-side and persists across sessions and devices. See [VERCEL_SETUP.md](./VERCEL_SETUP.md) for setup instructions.

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

[Specify license here]

## Contact

For questions or issues, please contact the project maintainer.
