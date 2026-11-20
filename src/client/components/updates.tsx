import * as React from 'react';
import { ArrowUpCircle, Check, Download, ExternalLink, RefreshCw, X } from 'lucide-react';
import { RELEASES_URL, hasUpdate } from '../../core/updates';
import type { UpdateStore } from '../updates';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function UpdateButton({updates}: {updates: UpdateStore}) {
  const state = React.useSyncExternalStore(updates.subscribe, updates.getSnapshot);
  const available = hasUpdate(state), checking = state.status === 'checking';
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className={`version-trigger ${available ? 'has-update' : ''}`} aria-label={available ? `版本与更新，有新版本 ${state.latest!.version}` : `版本与更新，当前版本 ${state.currentVersion}`}>
    {available && <ArrowUpCircle size={15} aria-hidden="true"/>}{available ? '有更新' : `v${state.currentVersion}`}
  </Button></PopoverTrigger><PopoverContent align="end" className="update-popover">
    <div className="update-heading"><strong>版本与更新</strong><span>DSH Follow-up</span></div>
    <div className="update-version"><span>当前版本</span><strong>v{state.currentVersion}</strong></div>
    <div className="update-status" role="status" aria-atomic="true">
      {checking ? <><RefreshCw size={16} className="animate-spin" aria-hidden="true"/>正在检查更新…</> : state.error ? state.error : available ? <><ArrowUpCircle size={16} aria-hidden="true"/>发现新版本 v{state.latest!.version}</> : state.checkedAt ? <><Check size={16} aria-hidden="true"/>已是最新版本</> : '自动检查更新，稍候即可查看结果'}
    </div>
    {available && <p className="update-notes">{state.latest!.notes || '包含功能改进与问题修复。'}</p>}
    {state.checkedAt && <p className="update-hint">上次检查：{new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(state.checkedAt))}</p>}
    <div className="update-actions"><Button variant="outline" size="sm" disabled={checking} onClick={() => void updates.check()}><RefreshCw size={14} aria-hidden="true"/>检查更新</Button>
      <Button asChild size="sm" variant={available ? 'default' : 'ghost'}><a href={available ? state.latest!.downloadUrl : RELEASES_URL} target="_blank" rel="noopener noreferrer">{available ? <Download size={14} aria-hidden="true"/> : <ExternalLink size={14} aria-hidden="true"/>}{available ? '下载更新' : '查看发布记录'}</a></Button>
    </div><p className="update-hint">每 6 小时自动检查；下载后在插件管理中安装。</p>
  </PopoverContent></Popover>;
}

export function UpdateNotice({updates}: {updates: UpdateStore}) {
  const state = React.useSyncExternalStore(updates.subscribe, updates.getSnapshot);
  if (!hasUpdate(state) || state.dismissedVersion === state.latest!.version) return null;
  const release = state.latest!;
  return <div className="dsh-followup"><aside className="update-notice" aria-label="插件更新通知">
    <div role="status" aria-atomic="true" className="update-notice-heading"><ArrowUpCircle size={18} aria-hidden="true"/><strong>DSH Follow-up 有更新</strong></div>
    <Button variant="ghost" size="icon" className="update-notice-close" aria-label="暂时隐藏此版本提示" onClick={updates.dismiss}><X size={16} aria-hidden="true"/></Button>
    <p>v{state.currentVersion} → v{release.version}</p><p className="update-hint">下载新版后，在插件管理中安装更新。</p>
    <Button asChild size="sm"><a href={release.downloadUrl} target="_blank" rel="noopener noreferrer"><Download size={14} aria-hidden="true"/>下载更新</a></Button>
  </aside></div>;
}
