import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
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
  Wallet,
  TrendingUp,
  PackageOpen,
  Tag,
  Trash2,
  Pencil,
  Search,
  ChevronDown,
} from "lucide-react";
import { expenseService } from "@/lib/expense-service";
import type { Expense } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { AddExpenseMenu } from "@/components/AddExpenseMenu";
import { ReceiptReviewDialog } from "@/components/ReceiptReviewDialog";
import { ReviewExpenseDialog } from "@/components/ReviewExpenseDialog";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserSettings } from "@/hooks/useUserSettings";
import type { ExpenseData } from "@/lib/expense-service";
import { useExpenseCreation } from "@/hooks/useExpenseCreation";
import Webcam from "react-webcam";
import { Camera, X, Lightbulb, Loader } from "lucide-react";
import { resizeImage } from "@/lib/utils";

const formatCurrency = (amount: number, currency: string = "USD") => {
  // Validate currency code and fallback to USD if invalid
  const validCurrency =
    currency && currency !== "Unknown" && currency.length === 3
      ? currency
      : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: validCurrency,
    }).format(amount);
  } catch (error) {
    // If the currency is still invalid, fallback to USD
    console.warn(`Invalid currency code: ${currency}, falling back to USD`);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
};
const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
}> = ({ title, value, icon }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);
const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
];
export const ExpensesPage: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { defaultCurrency } = useUserSettings();

  // Get current month in MM format for default filter
  const getCurrentMonth = () => {
    const now = new Date();
    return String(now.getMonth() + 1).padStart(2, "0");
  };

  // Get current year for default filter
  const getCurrentYear = () => {
    return String(new Date().getFullYear());
  };

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [selectedYear, setSelectedYear] = useState<string>(getCurrentYear());
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    expenses.forEach((exp) => yearsSet.add(new Date(exp.date).getFullYear()));
    return Array.from(yearsSet)
      .sort((a, b) => b - a)
      .map(String);
  }, [expenses]);
  // Track which expenses are expanded to show line items
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Audio recording state
  // Audio recording state
  const [extractedReceipts, setExtractedReceipts] = useState<ExpenseData[]>([]);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const webcamRef = React.useRef<Webcam>(null);

  const {
    isProcessing,
    isSaving,
    extractedData,
    setExtractedData,
    originalData,
    error: creationError,
    setError: setCreationError,
    handleImageProcessing,
    handleAudioProcessing,
    handleManualEntry,
    handleSave,
  } = useExpenseCreation();

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "environment",
  };

  const isMobile = useIsMobile();

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await expenseService.getExpenses();
      if (response.success && response.data) {
        setExpenses(response.data);
      } else {
        setError(response.error || "Failed to fetch expenses.");
      }
    } catch (e) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleAudioComplete = async (blob: Blob) => {
    const results = await handleAudioProcessing(blob);
    if (results && results.length > 0) {
      setExtractedReceipts(results);
      setIsReviewDialogOpen(true);
      toast.success(
        `Extracted ${results.length} receipt${
          results.length > 1 ? "s" : ""
        } from audio`
      );
    }
  };

  const handleImageUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Image = e.target?.result as string;
      if (base64Image) {
        handleImageProcessing(base64Image);
      }
    };
    reader.readAsDataURL(file);
  };

  const capture = React.useCallback(async () => {
    if (webcamRef.current && !isProcessing) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setIsCameraOpen(false);
        handleImageProcessing(imageSrc);
      }
    }
  }, [webcamRef, isProcessing]);

  const onSaveSuccess = async () => {
    const success = await handleSave();
    if (success) {
      fetchExpenses();
    }
  };

  const handleReviewSaveComplete = () => {
    fetchExpenses();
  };
  const filteredExpenses = useMemo(() => {
    // Apply month/year filter first
    let base = expenses;
    if (selectedYear !== "all" || selectedMonth !== "all") {
      base = base.filter((expense) => {
        const d = new Date(expense.date);
        const year = String(d.getFullYear());
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const yearOk = selectedYear === "all" || year === selectedYear;
        const monthOk = selectedMonth === "all" || month === selectedMonth;
        return yearOk && monthOk;
      });
    }

    // Then apply search filter
    if (!searchTerm) return base;
    const q = searchTerm.toLowerCase();
    return base.filter(
      (expense) =>
        expense.merchant.toLowerCase().includes(q) ||
        expense.category.toLowerCase().includes(q)
    );
  }, [expenses, searchTerm, selectedMonth, selectedYear]);
  const handleDelete = async (id: string) => {
    const response = await expenseService.deleteExpense(id);
    if (response.success) {
      setExpenses((prevExpenses) =>
        prevExpenses.filter((exp) => exp.id !== id)
      );
      toast.success("Expense deleted successfully.");
    } else {
      toast.error("Failed to delete expense.", { description: response.error });
    }
  };
  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setIsEditDialogOpen(true);
  };
  const handleSaveEdit = (updatedExpense: Expense) => {
    setExpenses((prevExpenses) =>
      prevExpenses.map((exp) =>
        exp.id === updatedExpense.id ? updatedExpense : exp
      )
    );
  };
  const totalSpent = filteredExpenses.reduce((acc, exp) => acc + exp.total, 0);
  const totalTransactions = filteredExpenses.length;
  const averageTransaction =
    totalTransactions > 0 ? totalSpent / totalTransactions : 0;
  const stats = [
    {
      title: "Total Spent",
      value: formatCurrency(totalSpent, defaultCurrency),
      icon: <Wallet className="h-4 w-4 text-muted-foreground" />,
    },
    {
      title: "Transactions",
      value: String(totalTransactions),
      icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />,
    },
    {
      title: "Average Transaction",
      value: formatCurrency(averageTransaction, defaultCurrency),
      icon: <Tag className="h-4 w-4 text-muted-foreground" />,
    },
  ];
  const barChartData = filteredExpenses
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((exp) => ({
      name: new Date(exp.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      total: exp.total,
    }));
  const pieChartData = useMemo(() => {
    const categoryTotals = filteredExpenses.reduce((acc, expense) => {
      const category = expense.category || "Other";
      acc[category] = (acc[category] || 0) + expense.total;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(categoryTotals).map(([name, value]) => ({
      name,
      value,
    }));
  }, [filteredExpenses]);
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (expenses.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <PackageOpen className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No expenses found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by scanning your first receipt.
        </p>
      </div>
    );
  }
  return (
    <>
      <Toaster richColors position="top-center" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-8 md:py-12"
      >
        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-gray-900 dark:text-white">
              Expenses Dashboard
            </h1>
            <div className="flex items-center gap-2">
              <AddExpenseMenu
                onScan={() => setIsCameraOpen(true)}
                onUploadImage={handleImageUpload}
                onAudioComplete={handleAudioComplete}
                onManualEntry={handleManualEntry}
                isProcessing={isProcessing}
              />
            </div>
          </div>
          {isMobile && (
            <div>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3">
                <div className="w-full md:w-48">
                  <Select
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All months</SelectItem>
                      <SelectItem value="01">January</SelectItem>
                      <SelectItem value="02">February</SelectItem>
                      <SelectItem value="03">March</SelectItem>
                      <SelectItem value="04">April</SelectItem>
                      <SelectItem value="05">May</SelectItem>
                      <SelectItem value="06">June</SelectItem>
                      <SelectItem value="07">July</SelectItem>
                      <SelectItem value="08">August</SelectItem>
                      <SelectItem value="09">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full md:w-40">
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All years</SelectItem>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <StatCard
                key={stat.title}
                title={stat.title}
                value={stat.value}
                icon={stat.icon}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">
                  Spending Over Time
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <div className="h-64 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Bar
                        dataKey="total"
                        fill="rgb(59, 130, 246)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">
                  Spending by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <div className="h-64 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) =>
                          formatCurrency(value, defaultCurrency)
                        }
                      />
                      <Legend iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          {isMobile && (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                <Input
                  placeholder="Search by merchant or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 sm:pl-10 w-full text-sm sm:text-base"
                />
              </div>
            </div>
          )}
          {!isMobile && (
            <div>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3">
                <div className="w-full md:w-48">
                  <Select
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All months</SelectItem>
                      <SelectItem value="01">January</SelectItem>
                      <SelectItem value="02">February</SelectItem>
                      <SelectItem value="03">March</SelectItem>
                      <SelectItem value="04">April</SelectItem>
                      <SelectItem value="05">May</SelectItem>
                      <SelectItem value="06">June</SelectItem>
                      <SelectItem value="07">July</SelectItem>
                      <SelectItem value="08">August</SelectItem>
                      <SelectItem value="09">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full md:w-40">
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All years</SelectItem>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search by merchant or category..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 sm:pl-10 w-full text-sm sm:text-base"
                  />
                </div>
              </div>
            </div>
          )}
          {/* Desktop Table */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" aria-label="expand column" />
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <React.Fragment key={expense.id}>
                      <TableRow
                        onClick={() => toggleExpanded(expense.id)}
                        className="cursor-pointer hover:bg-muted/40"
                        aria-expanded={!!expanded[expense.id]}
                        aria-label={`Expense ${expense.merchant} on ${new Date(
                          expense.date
                        ).toLocaleDateString()}`}
                      >
                        <TableCell className="text-muted-foreground">
                          <button
                            type="button"
                            aria-label={
                              expanded[expense.id] ? "Collapse" : "Expand"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(expense.id);
                            }}
                            className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                expanded[expense.id] ? "rotate-180" : "rotate-0"
                              }`}
                            />
                          </button>
                        </TableCell>
                        <TableCell>
                          {new Date(expense.date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {expense.merchant}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{expense.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(expense.total, expense.currency)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(expense);
                              }}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Are you sure?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will
                                    permanently delete this expense record.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(expense.id)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                      <AnimatePresence initial={false}>
                        {expanded[expense.id] && (
                          <TableRow
                            className="bg-muted/30"
                            key={`details-${expense.id}`}
                          >
                            <TableCell colSpan={6} className="p-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                style={{ overflow: "hidden" }}
                              >
                                <div className="px-4 py-3">
                                  {expense.lineItems &&
                                  expense.lineItems.length > 0 ? (
                                    <div className="rounded-md border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="w-20 text-right">
                                              Qty
                                            </TableHead>
                                            <TableHead className="w-28 text-right">
                                              Price
                                            </TableHead>
                                            <TableHead className="w-32 text-right">
                                              Subtotal
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {expense.lineItems.map(
                                            (item, idx) => (
                                              <TableRow key={idx}>
                                                <TableCell className="max-w-[300px] truncate">
                                                  {item.description}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  {item.quantity}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  {formatCurrency(
                                                    item.price,
                                                    expense.currency
                                                  )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  {formatCurrency(
                                                    item.quantity * item.price,
                                                    expense.currency
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            )
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      No items
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </TableCell>
                          </TableRow>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-gray-900 dark:text-white">
              Recent Transactions
            </h2>
            {filteredExpenses.map((expense) => (
              <Card
                key={expense.id}
                onClick={() => toggleExpanded(expense.id)}
                className="transition-colors cursor-pointer hover:bg-muted/40"
                aria-expanded={!!expanded[expense.id]}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base sm:text-lg truncate flex items-center gap-2">
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform ${
                            expanded[expense.id] ? "rotate-180" : "rotate-0"
                          }`}
                        />
                        {expense.merchant}
                      </CardTitle>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {new Date(expense.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {expense.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-xl sm:text-2xl font-bold text-right">
                    {formatCurrency(expense.total, expense.currency)}
                  </p>
                </CardContent>
                <CardFooter className="pt-0 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(expense);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently
                          delete this expense record.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(expense.id)}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
                <AnimatePresence initial={false}>
                  {expanded[expense.id] && (
                    <motion.div
                      key={`mobile-details-${expense.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="px-4 pb-4">
                        {expense.lineItems && expense.lineItems.length > 0 ? (
                          <div className="space-y-2">
                            {expense.lineItems.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-md border p-2"
                              >
                                <div className="pr-2 text-sm">
                                  {item.description}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  x{item.quantity}
                                </div>
                                <div className="ml-auto text-sm">
                                  {formatCurrency(
                                    item.quantity * item.price,
                                    expense.currency
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No items
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))}
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
          >
            <div className="relative w-full max-w-4xl">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="rounded-lg shadow-2xl w-full"
              />
              <div className="absolute bottom-4 left-4 right-4 bg-black/50 text-white p-3 rounded-lg text-sm flex items-center gap-3">
                <Lightbulb className="h-5 w-5 text-yellow-300 flex-shrink-0" />
                <span>
                  For best results: ensure good lighting and place the receipt
                  on a flat, contrasting surface.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <Button
                onClick={capture}
                disabled={isProcessing}
                className="w-20 h-20 rounded-full bg-white hover:bg-gray-200 ring-4 ring-white ring-offset-4 ring-offset-black/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <Loader className="h-10 w-10 text-black animate-spin" />
                ) : (
                  <Camera className="h-10 w-10 text-black" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => !isProcessing && setIsCameraOpen(false)}
                disabled={isProcessing}
                className="absolute top-6 right-6 text-white hover:bg-white/20 w-12 h-12 rounded-full disabled:opacity-50"
              >
                <X className="h-8 w-8" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <EditExpenseDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        expense={editingExpense}
        onSave={handleSaveEdit}
      />
      <ReviewExpenseDialog
        isMobile={isMobile}
        isProcessing={isProcessing}
        isSaving={isSaving}
        extractedData={extractedData}
        setExtractedData={setExtractedData}
        handleSave={onSaveSuccess}
        originalData={originalData}
      />
      <ReceiptReviewDialog
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        receipts={extractedReceipts}
        onSaveComplete={handleReviewSaveComplete}
      />
    </>
  );
};
