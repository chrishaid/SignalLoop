import { PrismaClient, StaffSnapshot } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Service for evaluating targeting rules
 *
 * Rules are stored as JSON expressions with the following structure:
 * {
 *   "operator": "AND" | "OR" | "NOT",
 *   "conditions": [
 *     {
 *       "field": "jobFamily" | "region" | "employeeType" | etc.,
 *       "operator": "equals" | "in" | "contains" | "greaterThan" | etc.,
 *       "value": any
 *     }
 *   ]
 * }
 */

interface RuleExpression {
  operator?: 'AND' | 'OR' | 'NOT';
  conditions?: Condition[];
  field?: string;
  comparison?: string;
  value?: any;
}

interface Condition {
  field: string;
  operator: string;
  value: any;
}

export class TargetingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Evaluate if a staff snapshot matches a campaign's target rules
   */
  async evaluateCampaignRules(
    campaign: any,
    snapshot: StaffSnapshot
  ): Promise<boolean> {
    // If no target rules, everyone is eligible
    if (!campaign.targetRules || campaign.targetRules.length === 0) {
      return true;
    }

    // Evaluate each target rule (OR logic between rules)
    for (const campaignRule of campaign.targetRules) {
      const rule = campaignRule.targetRule;
      const matches = this.evaluateRule(rule.expression as RuleExpression, snapshot);
      if (matches) {
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluate a single rule expression against a staff snapshot
   */
  evaluateRule(expression: RuleExpression, snapshot: StaffSnapshot): boolean {
    // Handle compound expressions
    if (expression.operator) {
      switch (expression.operator) {
        case 'AND':
          return expression.conditions!.every(cond =>
            this.evaluateCondition(cond, snapshot)
          );
        case 'OR':
          return expression.conditions!.some(cond =>
            this.evaluateCondition(cond, snapshot)
          );
        case 'NOT':
          return !expression.conditions!.some(cond =>
            this.evaluateCondition(cond, snapshot)
          );
        default:
          logger.warn(`Unknown operator: ${expression.operator}`);
          return false;
      }
    }

    // Handle simple condition
    return this.evaluateCondition(expression as any, snapshot);
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: Condition, snapshot: StaffSnapshot): boolean {
    const fieldValue = this.getFieldValue(condition.field, snapshot);

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;

      case 'notEquals':
        return fieldValue !== condition.value;

      case 'in':
        return Array.isArray(condition.value) &&
               condition.value.includes(fieldValue);

      case 'notIn':
        return Array.isArray(condition.value) &&
               !condition.value.includes(fieldValue);

      case 'contains':
        return typeof fieldValue === 'string' &&
               fieldValue.includes(condition.value);

      case 'startsWith':
        return typeof fieldValue === 'string' &&
               fieldValue.startsWith(condition.value);

      case 'greaterThan':
        return fieldValue > condition.value;

      case 'lessThan':
        return fieldValue < condition.value;

      case 'greaterThanOrEqual':
        return fieldValue >= condition.value;

      case 'lessThanOrEqual':
        return fieldValue <= condition.value;

      case 'exists':
        return fieldValue !== null && fieldValue !== undefined;

      case 'notExists':
        return fieldValue === null || fieldValue === undefined;

      default:
        logger.warn(`Unknown condition operator: ${condition.operator}`);
        return false;
    }
  }

  /**
   * Get a field value from a staff snapshot
   */
  private getFieldValue(field: string, snapshot: StaffSnapshot): any {
    // Handle nested fields (e.g., "customAttributes.role")
    if (field.includes('.')) {
      const parts = field.split('.');
      let value: any = snapshot;
      for (const part of parts) {
        value = value?.[part];
      }
      return value;
    }

    // Direct field access
    return (snapshot as any)[field];
  }

  /**
   * Validate a rule expression
   */
  validateRule(expression: RuleExpression): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (expression.operator) {
      if (!['AND', 'OR', 'NOT'].includes(expression.operator)) {
        errors.push(`Invalid operator: ${expression.operator}`);
      }
      if (!expression.conditions || !Array.isArray(expression.conditions)) {
        errors.push('Conditions array required for compound expressions');
      }
    } else {
      // Validate simple condition
      if (!expression.field) {
        errors.push('Field is required');
      }
      if (!expression.comparison) {
        errors.push('Comparison operator is required');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
