import { Context } from 'hono';
import { Env } from '../types';
import { DBService } from '../services/db.service';
import { validateRequest, expenseSchema } from '../utils/validation';
import { success, error, json, notFound } from '../utils/response';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

/**
 * GET /api/expenses
 * Get all expenses for the current user
 */
export async function getExpenses(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    const expenses = await dbService.getExpensesByUserId(userId);

    // Fetch line items for each expense
    const expensesWithLineItems = await Promise.all(
        expenses.map(async (expense) => {
            const lineItems = await dbService.getLineItemsByExpenseId(expense.id);
            return {
                ...expense,
                lineItems,
            };
        })
    );

    return json(success(expensesWithLineItems));
}

/**
 * GET /api/expenses/:id
 * Get a single expense by ID
 */
export async function getExpenseById(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const expenseId = c.req.param('id');
    const dbService = new DBService(env.DB);

    const expense = await dbService.getExpenseById(expenseId, userId);
    if (!expense) {
        return notFound('Expense not found');
    }

    const lineItems = await dbService.getLineItemsByExpenseId(expense.id);

    return json(
        success({
            ...expense,
            lineItems,
        })
    );
}

/**
 * POST /api/expenses
 * Create a new expense
 */
export async function createExpense(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    // Validate request body
    const validation = await validateRequest(c.req.raw, expenseSchema);
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { merchant, date, total, currency, category, lineItems } = validation.data;

    // Create expense
    const expenseId = crypto.randomUUID();
    const expense = await dbService.createExpense(
        {
            id: expenseId,
            user_id: userId,
            merchant,
            date,
            total,
            currency,
            category,
        },
        lineItems
    );

    // Fetch line items
    const fetchedLineItems = await dbService.getLineItemsByExpenseId(expense.id);

    return json(
        success({
            ...expense,
            lineItems: fetchedLineItems,
        }),
        201
    );
}

/**
 * PUT /api/expenses/:id
 * Update an existing expense
 */
export async function updateExpense(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const expenseId = c.req.param('id');
    const dbService = new DBService(env.DB);

    // Check if expense exists and belongs to user
    const existingExpense = await dbService.getExpenseById(expenseId, userId);
    if (!existingExpense) {
        return notFound('Expense not found');
    }

    // Validate request body
    const validation = await validateRequest(c.req.raw, expenseSchema);
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { merchant, date, total, currency, category, lineItems } = validation.data;

    // Update expense
    await dbService.updateExpense(
        expenseId,
        userId,
        {
            merchant,
            date,
            total,
            currency,
            category,
        },
        lineItems
    );

    // Fetch updated expense
    const updatedExpense = await dbService.getExpenseById(expenseId, userId);
    const fetchedLineItems = await dbService.getLineItemsByExpenseId(expenseId);

    return json(
        success({
            ...updatedExpense,
            lineItems: fetchedLineItems,
        })
    );
}

/**
 * DELETE /api/expenses/:id
 * Delete an expense
 */
export async function deleteExpense(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const expenseId = c.req.param('id');
    const dbService = new DBService(env.DB);

    // Check if expense exists and belongs to user
    const expense = await dbService.getExpenseById(expenseId, userId);
    if (!expense) {
        return notFound('Expense not found');
    }

    // Delete expense
    await dbService.deleteExpense(expenseId, userId);

    return json(success({ message: 'Expense deleted successfully' }));
}
