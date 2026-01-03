# LinkedIn CRM Pipeline

A personal CRM (Customer Relationship Management) system designed for managing LinkedIn connections, tracking cold email outreach, and managing your sales pipeline.

## Features

- **Contact Management**: Store and manage all your LinkedIn connections with details like name, company, title, email, and LinkedIn URL
- **Pipeline Stages**: Visual Kanban-style pipeline to track contacts through stages (Lead → Contacted → Responded → Meeting Scheduled → Negotiating → Won/Lost)
- **Cold Email Tracking**: Create, send, and track cold emails with follow-up reminders
- **Email Templates**: Pre-built templates for cold outreach and follow-ups with personalization placeholders
- **LinkedIn Import**: Import your LinkedIn connections directly from CSV export
- **Dashboard Analytics**: Overview of your contacts, email performance, and pipeline status
- **Activity Logging**: Automatic tracking of all interactions with contacts

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Abhiyash1991/Crm-linkedln.git
cd Crm-linkedln
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

### Development Mode

```bash
npm run dev
```

## How to Import LinkedIn Connections

1. Go to LinkedIn Settings & Privacy
2. Click on "Get a copy of your data"
3. Select "Connections" and request the archive
4. Download the CSV file when ready
5. In the CRM, go to Import/Export and upload the CSV file

## API Endpoints

### Contacts
- `GET /api/contacts` - Get all contacts
- `GET /api/contacts/:id` - Get single contact with activity history
- `POST /api/contacts` - Create new contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact

### Pipeline
- `GET /api/pipeline/stages` - Get pipeline stages
- `GET /api/pipeline/view` - Get contacts grouped by stage
- `POST /api/pipeline/move` - Move contact to different stage

### Emails
- `GET /api/emails` - Get all emails
- `GET /api/emails/follow-ups` - Get emails due for follow-up
- `POST /api/emails` - Create email draft
- `POST /api/emails/:id/send` - Mark email as sent
- `POST /api/emails/:id/replied` - Mark email as replied

### Import/Export
- `POST /api/import/linkedin` - Import LinkedIn CSV
- `GET /api/import/export` - Export contacts to CSV

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/tasks` - Get pending tasks and follow-ups

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (via better-sqlite3)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **File Upload**: Multer
- **CSV Processing**: csv-parse, csv-stringify

## Project Structure

```
linkedin-crm-pipeline/
├── server.js           # Express server entry point
├── db/
│   └── database.js     # Database setup and initialization
├── routes/
│   ├── contacts.js     # Contact management API
│   ├── emails.js       # Email tracking API
│   ├── pipeline.js     # Pipeline management API
│   ├── import.js       # Import/Export API
│   └── dashboard.js    # Dashboard statistics API
├── public/
│   ├── index.html      # Main HTML page
│   ├── css/
│   │   └── styles.css  # Application styles
│   └── js/
│       └── app.js      # Frontend JavaScript
├── data/               # SQLite database storage
└── uploads/            # Temporary file uploads
```

## License

MIT
