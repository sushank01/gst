'use client'

import { Link, useSearchParams } from '../../../lib/router'
import { Icon } from '../../../components/Icon'
import { marketApps } from '../../../lib/appData'
import { assetTabs, mastersTab } from '../../../lib/assetData'
import { useWorkspace } from '../../../lib/workspace'
import {
  AssetDashboard,
  AssetRegisterPane,
  AssetReportsPane,
  AssetRequestsPane,
  MyAssetPane,
} from './panes'
import { AssetSettingsPane, MasterTaxonomiesPane } from './settings'

const app = marketApps.find((item) => item.code === 'ITAM')

export default function AssetManagement() {
  const [params, setParams] = useSearchParams()
  const { installed, trialDaysLeft } = useWorkspace()
  const requested = params.get('tab')
  const onMasters = requested === mastersTab.id
  const tab = assetTabs.find((item) => item.id === requested)?.id ?? (onMasters ? 'settings' : 'dashboard')

  if (!app || !installed.includes('ITAM')) {
    return (
      <div className="mx-auto max-w-2xl pt-2">
        <h1 className="text-[22px] font-bold tracking-tight">Asset Management is not installed</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          Install it from the marketplace and its register, requests and agents appear here.
        </p>
        <Link to="/app/marketplace" className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline">
          Browse marketplace →
        </Link>
      </div>
    )
  }

  const select = (id: string) => setParams(id === 'dashboard' ? {} : { tab: id })
  // Master Taxonomies opens as its own top-level tab, beside Settings.
  const visibleTabs = onMasters ? [...assetTabs.slice(0, -1), mastersTab, assetTabs[assetTabs.length - 1]] : assetTabs

  return (
    <div className="pt-2">
      <header className="flex flex-wrap items-start gap-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white">
          <Icon name="server" size={22} />
        </span>
        <div className="min-w-[18rem] flex-1">
          <h1 className="text-[20px] font-bold tracking-tight">{app.name}</h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">
            Track assets as individually tagged units through their full lifecycle.
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">v1.0.0</p>
        </div>
        <span className="rounded-full bg-warn-muted px-3.5 py-1.5 text-[13px] font-medium text-warn">
          Trial · {trialDaysLeft} days left
        </span>
      </header>

      <nav aria-label="Asset Management" className="mt-5 flex flex-wrap gap-1 border-b border-line pb-3">
        {visibleTabs.map((item) => {
          const active = onMasters ? item.id === mastersTab.id : tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => select(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] transition ${
                active ? 'bg-accent font-semibold text-white' : 'text-fg-2 hover:bg-surface-2'
              }`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div key={requested ?? 'dashboard'} className="app-enter mt-5">
        {onMasters ? (
          <MasterTaxonomiesPane onBack={() => select('settings')} />
        ) : (
          <>
            {tab === 'dashboard' && <AssetDashboard />}
            {tab === 'assets' && <AssetRegisterPane />}
            {tab === 'my_equipment' && <MyAssetPane />}
            {tab === 'requests' && <AssetRequestsPane />}
            {tab === 'reports' && <AssetReportsPane />}
            {tab === 'settings' && <AssetSettingsPane onOpenMasters={() => select(mastersTab.id)} />}
          </>
        )}
      </div>
    </div>
  )
}
