# Grant Tagging System

Full-stack example that classifies and stores agricultural grants with LLM-filtered tags.

Project creation process

   I included TailwindCss and ShadCn and Zod, react-hook-form to the project which are common choice and best practise in this frontend stack. 
   I used Flask and Mongo db for backend, Flask is a common choice next to Django, I use it for years and I am satisfied with that.
   Mongodb is ideal for storing unstructured data and easy to set up, that is why I choosed it

  -I created a detailed prompt "ai_prompts.txt" for Cursor Agent, I used Auto option, hopefully done it with free tier(~1 hour)
      -1 for creating the project
      -1 for refining the design
  -project generation(~15 min)
  -my local docker collapsed was in error state so I needed to run it locally(~1hour)
    -install MongoDb
    -install python env, deps
    -install React deps
      -trouble with Tailwind version, downgraded to v3
  -refining design, layout(~30 min)

  I tested only with keyword based tagging, I included both option, I use only free tier Gemini

## Stack

- **Backend**: Flask, MongoDB, Gemini (Google Generative AI) for tagging
- **Frontend**: React + TypeScript (Vite), Tailwind CSS, shadcn-style UI components, react-hook-form + Zod
- **Design**: Modern teal/green color scheme with clean, minimalist layout
- **Infra**: Docker + Docker Compose

## Backend (Flask)

Location: `backend/`

### Configuration

Environment variables:

- `MONGO_URI` (default `mongodb://mongo:27017`)
- `MONGO_DB_NAME` (default `grants_db`)
- `MONGO_COLLECTION_NAME` (default `grants`)
- `GEMINI_API_KEY` (required for real LLM tagging; if omitted, a heuristic fallback is used)

Install and run locally:

```bash
cd backend
python -m venv venv
./venv/Scripts/activate  # Windows
pip install -r requirements.txt
set MONGO_URI=mongodb://localhost:27017
set GEMINI_API_KEY=your_key_here  # optional
python app.py
```

Backend will listen on `http://localhost:5000`.

### API Overview

- `GET /api/health` – simple health check
- `GET /api/tags` – returns the predefined tag list
- `POST /api/grants` – create grants (single object or array)
  - Input fields per grant: `grant_name`, `grant_description`
  - Server validates input, calls Gemini to assign tags from the predefined list, then stores in MongoDB.
- `GET /api/grants?tags=tag1,tag2` – list grants, optionally filtered by tags (must contain **all** requested tags)

Each stored grant has:

- `grant_name: string`
- `grant_description: string`
- `tags: string[]`

## Frontend (React + Vite)

Location: `frontend/`

### Dev server

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

The frontend expects the backend at `http://localhost:5000/api` by default. Override with:

```bash
set VITE_API_BASE_URL=http://localhost:5000/api
```

### UI Structure

- **Header**
  - Sticky navigation bar with logo and "Grant Tagging" branding
  - Teal/green color scheme throughout
- **Tabs**
  - **Users** tab:
    - Displays all grants using `GrantsTable` component
    - Grants header and description at the top
    - Search input on the left to filter tags
    - Tag multi-select filter buttons (click to toggle selection)
    - "Clear filters" button appears when filters are active
    - Live refetch when filters change
  - **Admin** tab:
    - JSON file upload form for bulk grant ingestion
    - Manual grant entry form (`grant_name`, `grant_description`)
    - Reuses `GrantsTable` component and auto-refreshes after new grants are added
- **GrantsTable Layout**
  - Header section: "Grants" title and description
  - Filter section below: Search input (left), tag buttons (middle), clear button (right)
  - Responsive table with hover states and teal tag badges
- **Forms**
  - Validation: Zod schema + `@hookform/resolvers/zod`
  - State: `react-hook-form`
  - Errors rendered via shadcn-style `FormMessage` with red error styling

## Docker / Docker Compose

Requirements:

- Docker
- Docker Compose v2+

### Build and run

From repository root:

```bash
docker compose up --build
```

Services:

- `mongo` – MongoDB
- `backend` – Flask API on `http://localhost:5000`
- `frontend` – React dev server on `http://localhost:5173`

For real LLM tagging in Docker, set `GEMINI_API_KEY` either:

- Via environment when running compose:

  ```bash
  set GEMINI_API_KEY=your_key_here
  docker compose up --build
  ```

- Or by wiring it into `docker-compose.yml` under the `backend` service.

## Design

The application features a modern, clean design with:

- **Color Scheme**: Teal/green primary colors (`hsl(173 80% 40%)`) for buttons and accents
- **Typography**: Clear hierarchy with teal headings and gray body text
- **Layout**: Responsive design with proper spacing and rounded corners
- **Components**: shadcn-style UI components with consistent styling
- **User Experience**: Sticky header, hover states, smooth transitions

## Usage Walkthrough

1. Bring up the stack (Docker) or run backend + frontend separately.
2. Open `http://localhost:5173` in the browser.
3. **Users tab**:
   - Browse existing grants in a clean table layout.
   - Use the search input to find specific tags.
   - Click tag buttons to filter grants (selected tags are highlighted in teal).
   - Click a selected tag again to unselect it.
   - Click "Clear filters" to reset all filters.
4. **Admin tab**:
   - **JSON upload**:
     - Choose a file shaped as:
       ```json
       [
         {
           "grant_name": "Nutrient Management Farmer Education Grants",
           "grant_description": "The Nutrient Management Farmer Education Grant Program supports nutrient management planning in Wisconsin...",
           "website_urls": ["https://example.com"],
           "document_urls": ["https://example.com/doc.pdf"]
         }
       ]
       ```
     - Extra fields like `website_urls` and `document_urls` are ignored.
   - **Manual entry**:
     - Fill in both fields, submit to create a single grant.
5. Newly added grants immediately appear in both Admin and Users views.

