# Project Monitoring System

A comprehensive React-based web application for project directors to monitor and manage multiple projects, track financial health, and make informed decisions. Built specifically for NETPAC AI to provide real-time insights into project performance, budget tracking, and operational health.

## 🚀 Features

### Dashboard Overview
- **High-Level KPIs**: Total projects, contract amounts, billed amounts, and outstanding balances
- **Interactive Visualizations**: 
  - Bar charts showing contract vs billed amounts by year
  - Pie charts displaying project status distribution
- **Real-time Project Health Indicators**: Color-coded status indicators for quick assessment

### Project Management
- **Comprehensive Project Table**: Sortable and filterable view of all projects
- **Advanced Filtering**: Filter by year, status, client, project director, and search terms
- **Project Details View**: In-depth project information including financial summaries and progress tracking

### Financial Tracking
- **Budget vs Actual**: Track contract amounts against billed amounts
- **Outstanding Balances**: Monitor remaining project balances and retention
- **Billing Progress**: Visual progress bars showing percentage of project completion
- **Project Health Scoring**: Automated health indicators based on billing performance

### User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Intuitive Navigation**: Easy switching between dashboard and detailed views
- **Material UI Components**: Modern, professional interface design

## 🛠️ Technology Stack

- **Frontend**: React 18 with TypeScript
- **UI Framework**: Material-UI (MUI) v5
- **Charts**: Recharts for data visualization
- **Styling**: Emotion (CSS-in-JS) with Material-UI theming
- **Date Handling**: date-fns for date formatting and manipulation
- **Build Tool**: Create React App with TypeScript template

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd project-monitoring-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Access the application**
   Open [http://localhost:3000](http://localhost:3000) in your browser

### OneDrive Attachments (optional)

To enable project file attachments stored in OneDrive:

1. Create an app in [Azure Portal](https://portal.azure.com) → App registrations → New registration
2. Add API permissions: Microsoft Graph → Delegated → `Files.ReadWrite`, `User.Read`
3. Add a redirect URI: `http://localhost:3000` (for dev)
4. Copy `.env.example` to `.env` and set `REACT_APP_ONEDRIVE_CLIENT_ID` to your app's Client ID
5. Restart the dev server

Files are stored in the user's OneDrive under `Projects/{projectId}/`.

## 🗂️ Project Structure

```
src/
├── components/           # React components
│   ├── Dashboard.tsx     # Main dashboard with KPIs and project table
│   ├── ProjectDetails.tsx # Detailed project view
│   └── ProjectMonitoringApp.tsx # Main application wrapper
├── data/
│   └── mockData.ts       # Sample project data
├── types/
│   └── Project.ts        # TypeScript type definitions
├── utils/
│   └── projectUtils.ts   # Utility functions for calculations
└── App.tsx              # Root application component
```

## 📊 Data Model

The application is built around the following core data structure:

### Project Interface
```typescript
interface Project {
  id: string;
  projectName: string;
  client: string;
  projectDirector: string;
  ovpNumber: string;
  poNumber: string;
  scopeOfWork: string;
  location: string;
  contractAmount: number;
  billedAmount: number;
  remainingBalance: number;
  retention: number;
  status: ProjectStatus;
  completionDate: Date | null;
  createdDate: Date;
  lastUpdated: Date;
  remarks?: string;
}
```

### Project Status Types
- **OPEN**: Active projects in progress
- **CLOSED**: Successfully completed projects
- **FOR_CLOSEOUT**: Projects awaiting final documentation
- **PENDING**: Projects on hold or waiting to start

## 🎯 Key Features Breakdown

### 1. Interactive Dashboard
- **KPI Cards**: Real-time metrics for total projects, contract amounts, and balances
- **Visual Charts**: Bar charts for yearly comparisons and pie charts for status distribution
- **Project Health**: Color-coded indicators showing project financial health

### 2. Advanced Filtering System
- **Multi-dimensional Filtering**: By year, status, client, project director
- **Real-time Search**: Instant filtering based on project name, client, or reference numbers
- **Dynamic Updates**: All visualizations update automatically based on applied filters

### 3. Detailed Project Views
- **Comprehensive Information**: All project details in an organized layout
- **Financial Summary**: Contract amounts, billed amounts, retention, and balances
- **Progress Tracking**: Visual progress bars showing billing completion percentage
- **Project Timeline**: Creation dates, completion dates, and last update information

### 4. Responsive Design
- **Mobile-Friendly**: Fully responsive layout that works on all device sizes
- **Modern UI**: Clean, professional interface following Material Design principles
- **Accessibility**: Built with accessibility best practices

## 📈 Usage Examples

### Viewing Project Health
The dashboard provides immediate visual feedback on project health through:
- **Green indicators**: Projects with >90% billing completion or closed status
- **Orange indicators**: Projects with 70-90% billing completion
- **Red indicators**: Projects with <70% billing completion

### Filtering Projects
Use the filter controls to:
- View projects for a specific year
- Filter by project status (Open, Closed, etc.)
- Show projects for a particular client or director
- Search by project name or reference numbers

### Project Analysis
Navigate to detailed views to:
- Review comprehensive project information
- Analyze financial performance and billing progress
- Track project timeline and milestones
- View project-specific remarks and notes

## 🔧 Available Scripts

- `npm start` - Start development server
- `npm run build` - Create production build
- `npm test` - Run test suite
- `npm run eject` - Eject from Create React App (not recommended)

## 🚀 Future Enhancements

The current implementation provides a solid foundation. Potential future enhancements include:

### Authentication & Authorization
- User login system with role-based access
- Project director-specific dashboards
- Admin controls for data management

### Data Integration
- API integration for real-time data updates
- CSV/Excel import functionality
- Database connectivity for persistent storage

### Advanced Analytics
- Trend analysis and forecasting
- Performance benchmarking
- Custom reporting and exports

### Enhanced Features
- Project timeline visualization
- Notification system for project milestones
- Collaboration tools and project notes
- Mobile application for field access

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## 📄 License

This project is built for NETPAC AI internal use. All rights reserved.

## 🤝 Support

For questions, issues, or feature requests, please contact the development team or create an issue in the project repository.

---

**Built with ❤️ for IOCT**
