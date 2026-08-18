/**
 * Types for Load Balancer tool
 */

export interface PalletPosition {
  index: number;
  positionFromFront: number; // distance from front of trailer in feet
  weight: number; // total weight of pallet(s) at this position in lbs
  palletType: 'standard' | 'chep';
  palletCount: number;
}

export interface WeightDistribution {
  steeringAxle: number; // lbs
  driveAxle: number; // lbs
  trailerAxles: number; // lbs
  totalWeight: number; // lbs
}

export interface LoadPlan {
  id: string;
  totalPallets: number;
  positions: PalletPosition[];
  weightDistribution: WeightDistribution;
  isValid: boolean;
  violations: string[];
  notes: string;
}

export interface LoadBalancerState {
  trailerType: string;
  totalPallets: number;
  palletType: 'standard' | 'chep';
  loadPlans: LoadPlan[];
  selectedPlanId: string | null;
  showWarnings: boolean;
}

export interface LoadAnalysis {
  canFitAll: boolean;
  maxPallets: number;
  optimalPlan: LoadPlan;
  alternativePlans: LoadPlan[];
  violations: {
    steeringAxle: boolean;
    driveAxle: boolean;
    trailerAxles: boolean;
    gvwr: boolean;
  };
}
