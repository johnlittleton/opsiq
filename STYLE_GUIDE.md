/* 
 * OpsIQ Tailwind Style Guide
 * Quick reference for updating pages to Glass design system
 */

/* ==================== BUTTONS ==================== */

/* Primary Button (Blue) */
<button className="px-4 py-2 bg-accent-blue hover:bg-accent-blue-hover text-white font-medium rounded-sm transition-all duration-150 hover:shadow-glow-blue">
  Primary Action
</button>

/* Secondary Button (Gray) */
<button className="px-4 py-2 bg-panel-DEFAULT hover:bg-panel-hover text-text-DEFAULT border border-panel-border font-medium rounded-sm transition-all duration-150">
  Secondary Action
</button>

/* Danger Button (Red) */
<button className="px-4 py-2 bg-accent-red hover:bg-red-600 text-white font-medium rounded-sm transition-all duration-150 hover:shadow-glow-red">
  Delete / Clear
</button>

/* Success Button (Green) */
<button className="px-4 py-2 bg-accent-green hover:bg-green-600 text-white font-medium rounded-sm transition-all duration-150 hover:shadow-glow-green">
  Confirm / Save
</button>

/* Small Button */
<button className="px-3 py-1.5 text-sm bg-accent-blue hover:bg-accent-blue-hover text-white rounded-sm transition-all">
  Small Action
</button>

/* Icon Button */
<button className="p-2 hover:bg-panel-hover rounded-sm transition-colors">
  <IconComponent size={18} className="text-text-muted" />
</button>

/* ==================== FORM INPUTS ==================== */

/* Text Input */
<input
  type="text"
  className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT placeholder:text-text-subtle focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
  placeholder="Enter value..."
/>

/* Number Input */
<input
  type="number"
  className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
/>

/* Select Dropdown */
<select className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all">
  <option>Option 1</option>
  <option>Option 2</option>
</select>

/* Textarea */
<textarea
  className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT placeholder:text-text-subtle focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all resize-none"
  rows={3}
  placeholder="Enter notes..."
/>

/* Checkbox */
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="w-4 h-4 rounded border-panel-border bg-background-tertiary checked:bg-accent-blue checked:border-accent-blue focus:ring-2 focus:ring-accent-blue/30"
  />
  <span className="text-sm text-text-DEFAULT">Checkbox Label</span>
</label>

/* Radio Button */
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="radio"
    name="group"
    className="w-4 h-4 border-panel-border bg-background-tertiary checked:bg-accent-blue checked:border-accent-blue focus:ring-2 focus:ring-accent-blue/30"
  />
  <span className="text-sm text-text-DEFAULT">Radio Label</span>
</label>

/* Date Input */
<input
  type="date"
  className="px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
/>

/* ==================== FORM GROUPS ==================== */

/* Form Group with Label */
<div className="space-y-1.5">
  <label className="block text-xs uppercase tracking-wide text-text-muted font-medium">
    Field Label
  </label>
  <input
    type="text"
    className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
  />
</div>

/* Form Group with Error */
<div className="space-y-1.5">
  <label className="block text-xs uppercase tracking-wide text-text-muted font-medium">
    Field Label
  </label>
  <input
    type="text"
    className="w-full px-3 py-2 bg-background-tertiary border-2 border-accent-red rounded-sm text-text-DEFAULT focus:outline-none focus:shadow-glow-red transition-all"
  />
  <p className="text-xs text-accent-red">This field is required</p>
</div>

/* ==================== LAYOUTS ==================== */

/* Page Container */
<div className="space-y-6">
  {/* Content */}
</div>

/* Grid Layout (2 columns) */
<div className="grid grid-cols-2 gap-4">
  {/* Items */}
</div>

/* Grid Layout (3 columns) */
<div className="grid grid-cols-3 gap-4">
  {/* Items */}
</div>

/* Grid Layout (4 columns) */
<div className="grid grid-cols-4 gap-4">
  {/* Items */}
</div>

/* Responsive Grid (2-3-4 columns) */
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {/* Items */}
</div>

/* Flex Row */
<div className="flex items-center gap-4">
  {/* Items */}
</div>

/* Flex Column */
<div className="flex flex-col gap-4">
  {/* Items */}
</div>

/* ==================== TYPOGRAPHY ==================== */

/* Page Title */
<h1 className="text-2xl font-bold text-text-DEFAULT mb-6">
  Page Title
</h1>

/* Section Title */
<h2 className="text-xl font-bold text-text-DEFAULT mb-4">
  Section Title
</h2>

/* Subsection Title */
<h3 className="text-lg font-semibold text-text-DEFAULT mb-3">
  Subsection Title
</h3>

/* Label (uppercase) */
<span className="text-xs uppercase tracking-wide text-text-muted font-medium">
  Label
</span>

/* Body Text */
<p className="text-sm text-text-DEFAULT">
  Body text content
</p>

/* Muted Text */
<p className="text-sm text-text-muted">
  Muted text content
</p>

/* Subtle Text */
<p className="text-xs text-text-subtle">
  Subtle text content
</p>

/* Monospace (Timer/Code) */
<span className="font-mono-timer text-lg text-accent-blue">
  12:34:56
</span>

/* Gradient Text (Blue) */
<span className="text-gradient-blue text-2xl font-bold">
  $45,678
</span>

/* ==================== STATUS INDICATORS ==================== */

/* Status Dot (Green/Open) */
<div className="flex items-center gap-2">
  <div className="w-2 h-2 rounded-full bg-status-open shadow-glow-green" />
  <span className="text-sm">Open</span>
</div>

/* Status Dot (Blue/Offload) */
<div className="flex items-center gap-2">
  <div className="w-2 h-2 rounded-full bg-status-offload shadow-glow-blue" />
  <span className="text-sm">Offload</span>
</div>

/* Status Dot (Yellow/Loading) */
<div className="flex items-center gap-2">
  <div className="w-2 h-2 rounded-full bg-status-loading shadow-glow-yellow" />
  <span className="text-sm">Loading</span>
</div>

/* Status Dot (Red/Parked) - Pulsing */
<div className="flex items-center gap-2">
  <div className="w-2 h-2 rounded-full bg-status-parked animate-pulse-glow" />
  <span className="text-sm">Parked</span>
</div>

/* ==================== LOADING STATES ==================== */

/* Spinner */
<div className="flex items-center justify-center p-8">
  <div className="w-8 h-8 border-4 border-panel-border border-t-accent-blue rounded-full animate-spin" />
</div>

/* Skeleton Loader */
<div className="animate-pulse space-y-3">
  <div className="h-4 bg-panel-DEFAULT rounded w-3/4" />
  <div className="h-4 bg-panel-DEFAULT rounded w-1/2" />
  <div className="h-4 bg-panel-DEFAULT rounded w-5/6" />
</div>

/* ==================== BADGES ==================== */

/* Info Badge */
<span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/30">
  Info
</span>

/* Success Badge */
<span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/30">
  Success
</span>

/* Warning Badge */
<span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/30">
  Warning
</span>

/* Danger Badge */
<span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-accent-red/10 text-accent-red border border-accent-red/30">
  Danger
</span>

/* ==================== ALERTS ==================== */

/* Info Alert */
<div className="glass p-4 rounded-sm border-l-4 border-accent-blue">
  <div className="flex gap-3">
    <InfoIcon size={20} className="text-accent-blue flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-text-DEFAULT">Information</h4>
      <p className="text-sm text-text-muted mt-1">Alert message content</p>
    </div>
  </div>
</div>

/* Success Alert */
<div className="glass p-4 rounded-sm border-l-4 border-accent-green">
  <div className="flex gap-3">
    <CheckCircle size={20} className="text-accent-green flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-text-DEFAULT">Success</h4>
      <p className="text-sm text-text-muted mt-1">Operation completed successfully</p>
    </div>
  </div>
</div>

/* Warning Alert */
<div className="glass p-4 rounded-sm border-l-4 border-accent-yellow">
  <div className="flex gap-3">
    <AlertTriangle size={20} className="text-accent-yellow flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-text-DEFAULT">Warning</h4>
      <p className="text-sm text-text-muted mt-1">Please review this information</p>
    </div>
  </div>
</div>

/* Error Alert */
<div className="glass p-4 rounded-sm border-l-4 border-accent-red">
  <div className="flex gap-3">
    <XCircle size={20} className="text-accent-red flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-text-DEFAULT">Error</h4>
      <p className="text-sm text-text-muted mt-1">An error occurred</p>
    </div>
  </div>
</div>

/* ==================== INFO ROW (for Dock Tiles) ==================== */

<div className="space-y-1">
  <div className="flex items-center gap-2 text-xs">
    <span className="text-text-subtle min-w-[80px]">Company:</span>
    <span className="text-text-DEFAULT font-medium">ABC Logistics</span>
  </div>
  <div className="flex items-center gap-2 text-xs">
    <span className="text-text-subtle min-w-[80px]">Driver:</span>
    <span className="text-text-DEFAULT font-medium">John Smith</span>
  </div>
  <div className="flex items-center gap-2 text-xs">
    <span className="text-text-subtle min-w-[80px]">Pickup #:</span>
    <span className="text-text-DEFAULT font-medium">PU-12345</span>
  </div>
</div>

/* ==================== USAGE EXAMPLES ==================== */

/* Example: LiveDockBoard Door Tile */
<GlassPanel hover className="p-4">
  <div className="flex items-center justify-between mb-3">
    <div className="text-2xl font-bold">Door 12</div>
    <StatusBadge status="Loading" />
  </div>
  
  <div className="font-mono-timer text-xl text-accent-blue mb-3">
    02:34:56
  </div>

  <div className="space-y-1 text-xs mb-4">
    <div className="flex items-center gap-2">
      <span className="text-text-subtle min-w-[70px]">Company:</span>
      <span className="text-text-DEFAULT">ABC Logistics</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-text-subtle min-w-[70px]">Driver:</span>
      <span className="text-text-DEFAULT">John Smith</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-text-subtle min-w-[70px]">Pickup #:</span>
      <span className="text-text-DEFAULT">PU-12345</span>
    </div>
  </div>

  <div className="flex gap-2">
    <button className="flex-1 px-3 py-1.5 text-xs bg-status-offload hover:bg-blue-600 text-white rounded-sm transition-all">
      Offload
    </button>
    <button className="flex-1 px-3 py-1.5 text-xs bg-accent-red hover:bg-red-600 text-white rounded-sm transition-all">
      Clear
    </button>
  </div>
</GlassPanel>

/* Example: Check-In Form */
<GlassPanel>
  <PanelHeader title="Driver Check-In" subtitle="Register new arrival" />
  <PanelBody>
    <form className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <label className="block text-xs uppercase tracking-wide text-text-muted font-medium">
          Company Name
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
          placeholder="Enter company name"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs uppercase tracking-wide text-text-muted font-medium">
          Driver Name
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-background-tertiary border border-panel-border rounded-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
          placeholder="Enter driver name"
        />
      </div>

      <div className="col-span-2 flex justify-end gap-3">
        <button
          type="button"
          className="px-4 py-2 bg-panel-DEFAULT hover:bg-panel-hover text-text-DEFAULT border border-panel-border font-medium rounded-sm transition-all duration-150"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue-hover text-white font-medium rounded-sm transition-all duration-150 hover:shadow-glow-blue"
        >
          Check In
        </button>
      </div>
    </form>
  </PanelBody>
</GlassPanel>

/* Example: KPI Dashboard with Stats */
<div className="space-y-6">
  <div className="grid grid-cols-4 gap-4">
    <StatPanel
      title="Total Pallets"
      value={12450}
      unit="pallets"
      variant="blue"
      trend="up"
      trendValue="+8%"
    />
    <StatPanel
      title="Total Cases"
      value={348920}
      unit="cases"
      variant="green"
    />
    <StatPanel
      title="Labor Cost"
      value="$8,450"
      variant="yellow"
    />
    <StatPanel
      title="Scrap Rate"
      value="3.2%"
      variant="red"
    />
  </div>

  <div className="grid grid-cols-2 gap-4">
    <RadialGaugePanel
      title="Scrap Rate %"
      value={3.2}
      max={10}
      unit="%"
      thresholds={{ green: 2, yellow: 5, red: 0 }}
    />
    <BarGaugePanel
      title="Line Utilization"
      value={85}
      max={100}
      unit="%"
      target={90}
    />
  </div>
</div>
