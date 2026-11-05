export interface NavigationTool {
  icon: string;
  title: string;
  description: string;
  path: string;
}

export interface NavigationSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  tools: NavigationTool[];
}

export function getNavigationSections(userRole: string, hasRestrictedAccess: boolean): NavigationSection[] {
  const sections: NavigationSection[] = [
    {
      id: 'dock-operations',
      title: 'Dock Operations',
      icon: '🚢',
      description: 'Dock boards, driver check-in, and dock verification',
      tools: [
        { icon: '🚢', title: 'Dock Dashboard', description: 'Monitor all 39 docks in real time', path: '/dockboard' },
        { icon: '✅', title: 'Driver Check In', description: 'Check in drivers and assign dock doors', path: '/checkin' },
        { icon: '👥', title: 'Active Drivers', description: 'View and manage currently checked-in drivers', path: '/active-drivers' },
        { icon: '🗄️', title: 'Dock History', description: 'View dock status changes and events', path: '/history' },
        { icon: '🚛', title: 'Check-In History', description: 'Review driver check-in records', path: '/checkin-history' },
        { icon: '📤', title: 'Outbound Checker Form', description: 'Submit outbound dock and pallet verification', path: '/dock-checker/outbound' },
        { icon: '📥', title: 'Inbound Checker Form', description: 'Submit inbound manifest, labels, QC, and damage checks', path: '/dock-checker/inbound' },
        { icon: '📚', title: 'Dock Checker History', description: 'Search checker forms by date', path: '/dock-checker/history' },
      ],
    },
    {
      id: 'appointments',
      title: 'Appointments',
      icon: '📅',
      description: 'Schedule, assign, and review appointments',
      tools: [
        { icon: '📅', title: 'Appointment Scheduler', description: 'Schedule inbound and outbound appointments', path: '/scheduler' },
        { icon: '📆', title: 'Appointment History', description: 'View past and upcoming appointments', path: '/appointment-history' },
      ],
    },
    {
      id: 'inventory-control',
      title: 'Inventory Control',
      icon: '🏷️',
      description: 'Receive, locate, move, and review inventory',
      tools: [
        { icon: '📊', title: 'Inventory Dashboard', description: 'Review on-hand pallets, storage utilization, and recent movement', path: '/inventory-dashboard' },
        { icon: '🏷️', title: 'Pallet Inventory', description: 'Receive, locate, move, and ship customer pallets', path: '/pallet-tracker' },
        { icon: '📜', title: 'Pallet History & Live Feed', description: 'Search pallet transactions and current inventory', path: '/inventory-pallet-history' },
        { icon: '🔎', title: 'Inventory Auditor', description: 'Run and reconcile inventory audits', path: '/inventory-auditor' },
      ],
    },
    {
      id: 'forced-air-cooling',
      title: 'Forced Air Cooling (FAC)',
      icon: '❄️',
      description: 'Schedule cooling loads, scan pallets, and monitor cooler timers',
      tools: [
        { icon: '❄️', title: 'FAC Dashboard', description: 'Monitor cooling loads in Coolers 2, 3, 6 and 7', path: '/fac-dashboard' },
        { icon: '🏷️', title: 'FAC Tracker', description: 'Capture pallets and manage cooling loads', path: '/fac-tracker' },
        { icon: '📅', title: 'FAC Schedule', description: 'Plan 45-minute cooler slots', path: '/fac-schedule' },
        { icon: '📜', title: 'FAC History', description: 'Review completed loads and full cooling reports', path: '/fac-history' },
      ],
    },
    {
      id: 'production',
      title: 'Production',
      icon: '🏭',
      description: 'Plan work, scan staffing, and monitor production',
      tools: [
        { icon: '🪪', title: 'Line Scan', description: 'Assign employees to production lines and review scans', path: '/production-line-scan' },
        { icon: '📋', title: 'Production Scheduler', description: 'Schedule work orders and daily completion times', path: '/production-scheduler' },
        { icon: '📈', title: 'Production Dashboard', description: 'Monitor production lines in real time', path: '/production-dashboard' },
        { icon: '🎛️', title: 'Line Controller', description: 'Update line headcount and completed cases', path: '/production-line-controller' },
        { icon: '🧮', title: 'Production Capacity', description: 'Calculate room capacity, staffing, and production time', path: '/production-capacity' },
        { icon: '📑', title: 'Work Order History', description: 'View completed work orders', path: '/work-order-history' },
        { icon: '📊', title: 'Production KPI', description: 'Review production performance', path: '/production' },
        { icon: '👷', title: 'Labor Planner', description: 'Plan labor against production needs', path: '/production-labor-planner' },
        { icon: '🧾', title: 'Production Costing', description: 'Review production labor and order costs', path: '/production-costing' },
      ],
    },
    {
      id: 'food-safety',
      title: 'Food Safety',
      icon: '🛡️',
      description: 'Run biweekly tin-cat inspections and review scan history',
      tools: [
        { icon: '🛡️', title: 'Tin Cat Scan', description: 'Scan tin cats and track biweekly inspection cycles', path: '/food-safety-tin-cats' },
      ],
    },
    {
      id: 'dispatch',
      title: 'Dispatch',
      icon: '🚢',
      description: 'Forecast vessel arrivals and container deliveries',
      tools: [
        { icon: '🧭', title: 'Dispatch Heads-Up', description: 'Monitor arrivals, releases, deliveries, and empty returns', path: '/dispatch-dashboard' },
        { icon: '🚢', title: 'Vessel & Container Forecast', description: 'Track vessel arrivals, delivery locations, and release status', path: '/container-forecast' },
      ],
    },
  ];

  const managementTools: NavigationTool[] = [
    ...(userRole === 'executive' ? [
      { icon: '📊', title: 'Executive Dashboard', description: 'Site performance metrics and top operators', path: '/executive' },
      ...(hasRestrictedAccess ? [{ icon: '🖥️', title: 'Combined Live Dashboard', description: 'All departments on one live internal screen', path: '/combined-live-operations' }] : []),
    ] : []),
    ...((userRole === 'executive' || userRole === 'manager') ? [
      { icon: '💼', title: 'Manager Dashboard', description: 'Track department headcount and live performance', path: '/labor-tracker' },
      { icon: '📱', title: 'Labor Kiosk', description: 'Open the employee punch kiosk and admin access', path: '/labor-kiosk' },
    ] : []),
  ];
  if (managementTools.length) {
    sections.push({
      id: 'management',
      title: 'Management',
      icon: '📊',
      description: 'Department operations and performance tools',
      tools: managementTools,
    });
  }
  return sections;
}
