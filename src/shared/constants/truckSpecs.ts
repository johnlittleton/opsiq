/**
 * Truck and trailer specifications for DOT weight compliance
 */

export interface TrailerSpec {
  id: string;
  name: string;
  length: number; // in feet
  wheelbaseLength: number; // distance from front axle to rear axle, in feet
  steeringAxlePos: number; // position from front in feet (typically 0)
  driveAxlePos: number; // position of drive axle from front in feet
  trailerAxlePos: number; // position of first trailer axle from front in feet
  trailerLength: number; // usable loading length in feet
  maxCapacity: number; // in lbs
  tareWeight: number; // empty trailer weight in lbs
  limits: {
    steeringAxle: number; // typically 12,000 lbs
    driveAxle: number; // typically 20,000 lbs
    trailerAxles: number; // typically 34,000 lbs (tandem)
    gvwr: number; // Gross Vehicle Weight Rating, typically 80,000 lbs
  };
}

export const TRUCK_SPECS: Record<string, TrailerSpec> = {
  '53ft': {
    id: '53ft',
    name: '53 ft Standard Dry Van',
    length: 53,
    wheelbaseLength: 45,
    steeringAxlePos: 0,
    driveAxlePos: 13,
    trailerAxlePos: 45,
    trailerLength: 48,
    maxCapacity: 45000, // typical for palletized freight
    tareWeight: 13000, // empty trailer ~13,000 lbs
    limits: {
      steeringAxle: 12000,
      driveAxle: 20000,
      trailerAxles: 34000,
      gvwr: 80000,
    },
  },
  '53ft-reefer': {
    id: '53ft-reefer',
    name: '53 ft Refrigerated Trailer',
    length: 53,
    wheelbaseLength: 45,
    steeringAxlePos: 0,
    driveAxlePos: 13,
    trailerAxlePos: 45,
    trailerLength: 48,
    maxCapacity: 43000, // slightly less due to reefer weight
    tareWeight: 15000, // refrigerated unit adds ~2,000 lbs
    limits: {
      steeringAxle: 12000,
      driveAxle: 20000,
      trailerAxles: 34000,
      gvwr: 80000,
    },
  },
  '48ft': {
    id: '48ft',
    name: '48 ft Dry Van',
    length: 48,
    wheelbaseLength: 40,
    steeringAxlePos: 0,
    driveAxlePos: 13,
    trailerAxlePos: 40,
    trailerLength: 43,
    maxCapacity: 40000,
    tareWeight: 12000,
    limits: {
      steeringAxle: 12000,
      driveAxle: 20000,
      trailerAxles: 34000,
      gvwr: 80000,
    },
  },
  '45ft': {
    id: '45ft',
    name: '45 ft Dry Van',
    length: 45,
    wheelbaseLength: 37,
    steeringAxlePos: 0,
    driveAxlePos: 13,
    trailerAxlePos: 37,
    trailerLength: 40,
    maxCapacity: 40000,
    tareWeight: 12000,
    limits: {
      steeringAxle: 12000,
      driveAxle: 20000,
      trailerAxles: 34000,
      gvwr: 80000,
    },
  },
  '40ft': {
    id: '40ft',
    name: '40 ft Container Chassis',
    length: 40,
    wheelbaseLength: 33,
    steeringAxlePos: 0,
    driveAxlePos: 13,
    trailerAxlePos: 33,
    trailerLength: 35,
    maxCapacity: 40000,
    tareWeight: 10000,
    limits: {
      steeringAxle: 12000,
      driveAxle: 20000,
      trailerAxles: 34000,
      gvwr: 80000,
    },
  },
  '28ft': {
    id: '28ft',
    name: '28 ft Pup Trailer (LTL)',
    length: 28,
    wheelbaseLength: 20,
    steeringAxlePos: 0,
    driveAxlePos: 13,
    trailerAxlePos: 20,
    trailerLength: 23,
    maxCapacity: 20000,
    tareWeight: 8000,
    limits: {
      steeringAxle: 12000,
      driveAxle: 20000,
      trailerAxles: 34000,
      gvwr: 80000,
    },
  },
};

export const PALLET_SPECS = {
  standard: {
    name: 'Standard Pallet',
    weight: 40, // lbs
  },
  chep: {
    name: 'CHEP Pallet',
    weight: 65, // lbs
  },
};

export const TRAILER_OPTIONS = Object.values(TRUCK_SPECS).map((spec) => ({
  value: spec.id,
  label: spec.name,
}));

export const PALLET_OPTIONS = [
  { value: 'standard', label: 'Standard Pallet (40 lbs)' },
  { value: 'chep', label: 'CHEP Pallet (65 lbs)' },
];
