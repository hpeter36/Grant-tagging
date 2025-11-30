import "./index.css";
import { AdminTab } from "./components/AdminTab";
import { UserTab } from "./components/UserTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Toaster } from './components/ui/toaster';

function App() {
  return (
    <div className="min-h-screen bg-white text-foreground">
      {/* Header similar to Lasso design */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <h1 className="text-2xl font-semibold text-teal-700">
              Grant Tagging
            </h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-teal-700 mb-2">
            Grant Tagging System
          </h2>
          <p className="text-base text-gray-600">
            Admins can ingest new grants, users can browse grants with tag-based
            filters.
          </p>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="bg-gray-100 p-1 rounded-lg">
            <TabsTrigger value="users" className="px-6 py-2 rounded-md">
              Users
            </TabsTrigger>
            <TabsTrigger value="admin" className="px-6 py-2 rounded-md">
              Admin
            </TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-6">
            <UserTab />
          </TabsContent>
          <TabsContent value="admin" className="mt-6">
            <AdminTab />
          </TabsContent>
        </Tabs>
      </main>
      <Toaster />
    </div>
  );
}

export default App;
