import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader,
  Users,
  Receipt,
  TrendingUp,
  Search,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  expenseService,
  AdminStats,
  UserWithStats,
  UserExpense,
} from "@/lib/expense-service";

// Helper to format relative time
function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never";

  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (days > 30) return `${Math.floor(days / 30)} months ago`;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return "Just now";
}

// Helper to format date
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Stats Card Component
const StatCard: React.FC<{
  title: string;
  value: number | string;
  description?: string;
  icon: React.ReactNode;
}> = ({ title, value, description, icon }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </CardContent>
  </Card>
);

// User Row Component with expandable expenses
const UserRow: React.FC<{
  user: UserWithStats;
  onViewExpenses: (email: string) => void;
  isLoadingExpenses: boolean;
  expenses: UserExpense[] | null;
  isExpanded: boolean;
}> = ({ user, onViewExpenses, isLoadingExpenses, expenses, isExpanded }) => {
  const isActive =
    user.lastExpenseAt &&
    Date.now() - user.lastExpenseAt < 7 * 24 * 60 * 60 * 1000;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => onViewExpenses(user.email)}
      >
        <TableCell className="font-medium">{user.email}</TableCell>
        <TableCell>
          <Badge variant={user.email_verified ? "default" : "secondary"}>
            {user.email_verified ? "Verified" : "Unverified"}
          </Badge>
        </TableCell>
        <TableCell>{formatDate(user.created_at)}</TableCell>
        <TableCell>{user.expenseCount}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {isActive && <span className="w-2 h-2 rounded-full bg-green-500" />}
            <span
              className={
                isActive
                  ? "text-green-600 dark:text-green-400"
                  : "text-muted-foreground"
              }
            >
              {formatRelativeTime(user.lastExpenseAt)}
            </span>
          </div>
        </TableCell>
        <TableCell>{user.settings?.aiProvider || "gemini"}</TableCell>
        <TableCell>{user.settings?.currency || "USD"}</TableCell>
        <TableCell>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-4">
            {isLoadingExpenses ? (
              <div className="flex items-center justify-center py-4">
                <Loader className="h-6 w-6 animate-spin" />
              </div>
            ) : expenses && expenses.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-medium text-sm mb-3">
                  Recent Expenses (Last 100)
                </h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Line Items</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.slice(0, 10).map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{expense.date}</TableCell>
                          <TableCell>{expense.merchant}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{expense.category}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {expense.currency} {expense.total.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {expense.lineItems.length > 0 ? (
                              <span className="text-muted-foreground">
                                {expense.lineItems.length} items
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {expenses.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Showing 10 of {expenses.length} expenses
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No expenses found
              </p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userExpenses, setUserExpenses] = useState<
    Record<string, UserExpense[]>
  >({});
  const [loadingExpenses, setLoadingExpenses] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAndLoadData();
  }, []);

  const checkAdminAndLoadData = async () => {
    setIsLoading(true);

    // Check if user is admin
    const adminCheck = await expenseService.checkAdmin();
    if (!adminCheck.success || !adminCheck.isAdmin) {
      setIsAuthorized(false);
      setIsLoading(false);
      return;
    }

    setIsAuthorized(true);

    // Load stats and users in parallel
    const [statsResult, usersResult] = await Promise.all([
      expenseService.getAdminStats(),
      expenseService.getAdminUsers(),
    ]);

    if (statsResult.success && statsResult.data) {
      setStats(statsResult.data);
    } else {
      toast.error("Failed to load stats");
    }

    if (usersResult.success && usersResult.data) {
      setUsers(usersResult.data);
    } else {
      toast.error("Failed to load users");
    }

    setIsLoading(false);
  };

  const handleViewExpenses = async (email: string) => {
    if (expandedUser === email) {
      setExpandedUser(null);
      return;
    }

    setExpandedUser(email);

    if (userExpenses[email]) {
      return; // Already loaded
    }

    setLoadingExpenses(email);
    const result = await expenseService.getAdminUserExpenses(email);

    if (result.success && result.data) {
      setUserExpenses((prev) => ({ ...prev, [email]: result.data! }));
    } else {
      toast.error(`Failed to load expenses for ${email}`);
    }

    setLoadingExpenses(null);
  };

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show 404 for non-admins
  if (!isLoading && !isAuthorized) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-muted-foreground mb-8">Page not found</p>
        <Button onClick={() => navigate("/home")}>Go Home</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-7xl mx-auto py-8 px-4">
        <div className="flex items-center justify-center py-16">
          <Loader className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          System analytics and user management
        </p>
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Users"
              value={stats?.totalUsers || 0}
              description={`+${stats?.newUsersThisWeek || 0} this week`}
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Active Users (7d)"
              value={stats?.activeUsers7Days || 0}
              description="Users with expenses in last 7 days"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Total Expenses"
              value={stats?.totalExpenses || 0}
              description={`+${stats?.expensesThisWeek || 0} this week`}
              icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Today's Activity"
              value={stats?.expensesToday || 0}
              description={`${stats?.newUsersToday || 0} new users`}
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          {/* Breakdowns */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category Breakdown</CardTitle>
                <CardDescription>
                  Expense distribution by category
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.categoryBreakdown &&
                stats.categoryBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {stats.categoryBreakdown.map((cat) => (
                      <div
                        key={cat.category}
                        className="flex justify-between items-center"
                      >
                        <span className="text-sm">{cat.category}</span>
                        <Badge variant="secondary">{cat.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </CardContent>
            </Card>

            {/* AI Provider Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  AI Provider Preferences
                </CardTitle>
                <CardDescription>User provider selections</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.aiProviderBreakdown &&
                stats.aiProviderBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {stats.aiProviderBreakdown.map((provider) => (
                      <div
                        key={provider.provider}
                        className="flex justify-between items-center"
                      >
                        <span className="text-sm capitalize">
                          {provider.provider}
                        </span>
                        <Badge variant="secondary">{provider.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </CardContent>
            </Card>

            {/* Currency Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Currency Distribution
                </CardTitle>
                <CardDescription>Default currency preferences</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.currencyBreakdown &&
                stats.currencyBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {stats.currencyBreakdown.map((curr) => (
                      <div
                        key={curr.currency}
                        className="flex justify-between items-center"
                      >
                        <span className="text-sm">{curr.currency}</span>
                        <Badge variant="secondary">{curr.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Placeholder for future AI analytics */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Coming Soon: AI Processing Analytics</AlertTitle>
            <AlertDescription>
              Input/output logging for receipt processing will be added in a
              future update. This will include processing times, success rates,
              and error analysis.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Expenses</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>AI Provider</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <UserRow
                        key={user.id}
                        user={user}
                        onViewExpenses={handleViewExpenses}
                        isLoadingExpenses={loadingExpenses === user.email}
                        expenses={userExpenses[user.email] || null}
                        isExpanded={expandedUser === user.email}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Analytics Tab (Placeholder) */}
        <TabsContent value="analytics" className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Analytics Coming Soon</AlertTitle>
            <AlertDescription>
              Detailed analytics including charts, trends, and AI processing
              metrics will be available once input/output logging is
              implemented. This will include:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Processing success/failure rates by provider</li>
                <li>Average processing time trends</li>
                <li>Common extraction errors</li>
                <li>User engagement patterns</li>
                <li>Receipt image quality analysis</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Monthly Stats Placeholder */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    New Users
                  </span>
                  <span className="font-medium">
                    {stats?.newUsersThisMonth || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Expenses Created
                  </span>
                  <span className="font-medium">
                    {stats?.expensesThisMonth || 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">This Week</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    New Users
                  </span>
                  <span className="font-medium">
                    {stats?.newUsersThisWeek || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Expenses Created
                  </span>
                  <span className="font-medium">
                    {stats?.expensesThisWeek || 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Today</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    New Users
                  </span>
                  <span className="font-medium">
                    {stats?.newUsersToday || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Expenses Created
                  </span>
                  <span className="font-medium">
                    {stats?.expensesToday || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
