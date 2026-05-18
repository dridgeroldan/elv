# ELV · Employee Lifetime Value

A web-based KPI tracking and performance management system for IT staff, connected to Supabase.

## 🚀 GitHub Pages Deployment

1. Push all files to a GitHub repo (keep the folder structure intact)
2. Go to **Settings → Pages → Source → Deploy from branch → main → / (root)**
3. Your site will be live at `https://yourusername.github.io/your-repo-name/`

## 🗄️ Supabase Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and paste + run the contents of `supabase_schema.sql`
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public** key
4. Open your live site, click **⚙ Settings**, paste the URL and key, and click **Connect & Save**

## 📁 File Structure

```
/
├── index.html          ← Main app shell
├── css/
│   └── style.css       ← All styles (dark/light mode)
├── js/
│   └── app.js          ← Full application logic
├── supabase_schema.sql ← Run this in Supabase SQL Editor
└── README.md
```

## ✨ Features

- **Dashboard** — Monthly performance trends, KPI radar chart, employee summary table
- **Employees** — Add/edit/delete IT staff, view YTD scores
- **Monthly Tracker** — Log and edit monthly summaries (avg score, bonus, deductions, zero tolerance)
- **KPI Entry** — Daily KPI logging with auto-calculation of weighted values; auto-updates monthly avg
- **Reports** — Full-year charts, KPI weight distribution, detailed monthly breakdown

## 📊 KPI Formula

```
Employee Value = (0.25 × System Uptime) + (0.20 × Timeliness) + (0.20 × Technical Accuracy)
              + (0.15 × Compliance) + (0.10 × Coordination) + (0.05 × Attendance)
              + (0.05 × Grooming and Hygiene)
```

Scores over 100% are possible through bonus points. Zero Tolerance violations are flagged separately.
