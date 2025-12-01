/**
 * Mock Analytics Tools for Benchmarking
 * 
 * These tools return realistic data payloads to test variable reuse benefits.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Mock data generators
function generateCustomers(region: string, count: number = 50) {
  const customers = [];
  const segments = ['Enterprise', 'SMB', 'Startup', 'Individual'];
  const managers = ['Sarah Johnson', 'Mike Chen', 'Lisa Park', 'David Kim', 'Emma Wilson'];
  
  for (let i = 0; i < count; i++) {
    customers.push({
      id: `cust_${region.toLowerCase()}_${String(i + 1).padStart(3, '0')}`,
      name: `Customer ${i + 1} - ${region}`,
      email: `customer${i + 1}@${region.toLowerCase()}.example.com`,
      region: region,
      segment: segments[Math.floor(Math.random() * segments.length)],
      totalSpend: Math.round(Math.random() * 50000 * 100) / 100,
      lastPurchase: new Date(2024, Math.floor(Math.random() * 11), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
      accountManager: managers[Math.floor(Math.random() * managers.length)],
      phone: `+1-555-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      address: `${Math.floor(Math.random() * 9999) + 1} Main St, ${region}`,
      createdAt: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
    });
  }
  return customers;
}

function generateTransactions(customerId: string, count: number = 20) {
  const transactions = [];
  const statuses = ['completed', 'completed', 'completed', 'pending', 'refunded'];
  const products = ['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004', 'SKU-005', 'SKU-006', 'SKU-007', 'SKU-008'];
  
  for (let i = 0; i < count; i++) {
    const numProducts = Math.floor(Math.random() * 3) + 1;
    const selectedProducts = [];
    for (let j = 0; j < numProducts; j++) {
      selectedProducts.push(products[Math.floor(Math.random() * products.length)]);
    }
    
    transactions.push({
      id: `txn_${customerId}_${String(i + 1).padStart(4, '0')}`,
      customerId: customerId,
      date: new Date(2024, Math.floor(Math.random() * 11), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
      amount: Math.round(Math.random() * 5000 * 100) / 100,
      products: selectedProducts,
      quantity: Math.floor(Math.random() * 10) + 1,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      paymentMethod: Math.random() > 0.5 ? 'credit_card' : 'bank_transfer',
      notes: `Order processed for ${customerId}`,
    });
  }
  return transactions;
}

// Tool: Search Customers
export const searchCustomersTool = createTool({
  id: 'search-customers',
  description: 'Search for customers by region. Returns a list of customer records with their details.',
  inputSchema: z.object({
    region: z.string().describe('The region to search for customers (e.g., "California", "Texas", "New York")'),
    limit: z.number().optional().default(50).describe('Maximum number of customers to return'),
  }),
  outputSchema: z.object({
    customers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      region: z.string(),
      segment: z.string(),
      totalSpend: z.number(),
      lastPurchase: z.string(),
      accountManager: z.string(),
      phone: z.string(),
      address: z.string(),
      createdAt: z.string(),
    })),
    totalCount: z.number(),
    region: z.string(),
  }),
  execute: async ({ context }) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const customers = generateCustomers(context.region, context.limit || 50);
    return {
      customers,
      totalCount: customers.length,
      region: context.region,
    };
  },
});

// Tool: Get Transactions for Customers
export const getTransactionsTool = createTool({
  id: 'get-transactions',
  description: 'Get transaction history for a list of customer IDs. Returns detailed transaction records.',
  inputSchema: z.object({
    customerIds: z.array(z.string()).describe('Array of customer IDs to get transactions for'),
    startDate: z.string().optional().describe('Start date for transaction filter (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date for transaction filter (YYYY-MM-DD)'),
  }),
  outputSchema: z.object({
    transactions: z.array(z.object({
      id: z.string(),
      customerId: z.string(),
      date: z.string(),
      amount: z.number(),
      products: z.array(z.string()),
      quantity: z.number(),
      status: z.string(),
      paymentMethod: z.string(),
      notes: z.string(),
    })),
    totalCount: z.number(),
    totalAmount: z.number(),
  }),
  execute: async ({ context }) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const allTransactions: ReturnType<typeof generateTransactions> = [];
    for (const customerId of context.customerIds.slice(0, 20)) { // Limit to 20 customers for reasonable size
      const txns = generateTransactions(customerId, 10);
      allTransactions.push(...txns);
    }
    
    const totalAmount = allTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    return {
      transactions: allTransactions,
      totalCount: allTransactions.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  },
});

// Tool: Filter Data
export const filterDataTool = createTool({
  id: 'filter-data',
  description: 'Filter a dataset based on criteria. Can filter customers by spend threshold or transactions by amount.',
  inputSchema: z.object({
    dataType: z.enum(['customers', 'transactions']).describe('Type of data to filter'),
    data: z.any().describe('The data array to filter'),
    filterField: z.string().describe('Field to filter on (e.g., "totalSpend", "amount")'),
    operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq']).describe('Comparison operator'),
    value: z.number().describe('Value to compare against'),
  }),
  outputSchema: z.object({
    filtered: z.array(z.any()),
    originalCount: z.number(),
    filteredCount: z.number(),
    filterApplied: z.string(),
  }),
  execute: async ({ context }) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const data = context.data as any[];
    const filtered = data.filter(item => {
      const fieldValue = item[context.filterField];
      switch (context.operator) {
        case 'gt': return fieldValue > context.value;
        case 'lt': return fieldValue < context.value;
        case 'gte': return fieldValue >= context.value;
        case 'lte': return fieldValue <= context.value;
        case 'eq': return fieldValue === context.value;
        default: return true;
      }
    });
    
    return {
      filtered,
      originalCount: data.length,
      filteredCount: filtered.length,
      filterApplied: `${context.filterField} ${context.operator} ${context.value}`,
    };
  },
});

// Tool: Aggregate Data
export const aggregateDataTool = createTool({
  id: 'aggregate-data',
  description: 'Calculate aggregate statistics on a dataset.',
  inputSchema: z.object({
    data: z.any().describe('The data array to aggregate'),
    field: z.string().describe('Numeric field to aggregate (e.g., "totalSpend", "amount")'),
    groupBy: z.string().optional().describe('Optional field to group by'),
  }),
  outputSchema: z.object({
    count: z.number(),
    sum: z.number(),
    average: z.number(),
    min: z.number(),
    max: z.number(),
    groupedResults: z.record(z.string(), z.object({
      count: z.number(),
      sum: z.number(),
      average: z.number(),
    })).optional(),
  }),
  execute: async ({ context }) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const data = context.data as any[];
    const values = data.map(item => item[context.field]).filter(v => typeof v === 'number');
    
    const sum = values.reduce((a, b) => a + b, 0);
    const result: any = {
      count: values.length,
      sum: Math.round(sum * 100) / 100,
      average: values.length > 0 ? Math.round((sum / values.length) * 100) / 100 : 0,
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
    };
    
    if (context.groupBy) {
      const groups: Record<string, number[]> = {};
      for (const item of data) {
        const key = item[context.groupBy] || 'unknown';
        if (!groups[key]) groups[key] = [];
        if (typeof item[context.field] === 'number') {
          groups[key].push(item[context.field]);
        }
      }
      
      result.groupedResults = {};
      for (const [key, vals] of Object.entries(groups)) {
        const groupSum = vals.reduce((a, b) => a + b, 0);
        result.groupedResults[key] = {
          count: vals.length,
          sum: Math.round(groupSum * 100) / 100,
          average: Math.round((groupSum / vals.length) * 100) / 100,
        };
      }
    }
    
    return result;
  },
});

export const analyticsTools = {
  searchCustomersTool,
  getTransactionsTool,
  filterDataTool,
  aggregateDataTool,
};
