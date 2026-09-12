import { createClient, type User } from '@supabase/supabase-js'
import type { Patient, Block, Prescription, Task, Settings } from './types'

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
)

// ---- 인증 ----
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signOut(): Promise<void> {
  await sb.auth.signOut()
}
export async function currentUser(): Promise<User | null> {
  const { data } = await sb.auth.getUser()
  return data.user
}
export function onAuth(cb: (user: User | null) => void): void {
  sb.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null))
}

// ---- 읽기 ----
export async function loadAll(): Promise<{
  patients: Patient[]
  blocks: Block[]
  prescriptions: Prescription[]
  tasks: Task[]
}> {
  const [patients, blocks, prescriptions, tasks] = await Promise.all([
    sb.from('patients').select('*').order('name'),
    sb.from('blocks').select('*').order('created_at'),
    sb.from('prescriptions').select('*').order('prescribed_on'),
    sb.from('tasks').select('*').order('due_on'),
  ])
  return {
    patients: (patients.data ?? []) as Patient[],
    blocks: (blocks.data ?? []) as Block[],
    prescriptions: (prescriptions.data ?? []) as Prescription[],
    tasks: (tasks.data ?? []) as Task[],
  }
}
export async function loadSettings(): Promise<Settings> {
  const { data } = await sb.from('settings').select('*').eq('id', 1).single()
  return {
    weekly_closed: (data?.weekly_closed ?? [0, 4]) as number[],
    holidays: (data?.holidays ?? []) as string[],
    no_delivery: (data?.no_delivery ?? []) as string[],
  }
}

// ---- 쓰기 ----
export async function insertPatient(p: Omit<Patient, 'id'>): Promise<Patient> {
  const { data, error } = await sb.from('patients').insert(p).select().single()
  if (error) throw error
  return data as Patient
}
export async function insertBlock(b: Omit<Block, 'id' | 'created_at'>): Promise<Block> {
  const { data, error } = await sb.from('blocks').insert(b).select().single()
  if (error) throw error
  return data as Block
}
export async function insertPrescription(r: Omit<Prescription, 'id'>): Promise<Prescription> {
  const { data, error } = await sb.from('prescriptions').insert(r).select().single()
  if (error) throw error
  return data as Prescription
}
export async function insertTasks(ts: Omit<Task, 'id'>[]): Promise<void> {
  const { error } = await sb.from('tasks').insert(ts)
  if (error) throw error
}
export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const { error } = await sb.from('tasks').update(patch).eq('id', id)
  if (error) throw error
}
export async function deleteTask(id: string): Promise<void> {
  await sb.from('tasks').delete().eq('id', id)
}
export async function deleteTasksBy(prescriptionId: string, kind: string): Promise<void> {
  await sb.from('tasks').delete().eq('prescription_id', prescriptionId).eq('kind', kind)
}
export async function saveSettings(s: Settings): Promise<void> {
  const { error } = await sb.from('settings').update(s).eq('id', 1)
  if (error) throw error
}
export async function deletePatient(id: string): Promise<void> {
  await sb.from('patients').delete().eq('id', id) // 연쇄로 결제·처방·일정도 삭제
}
export async function deletePrescriptionCascade(prescriptionId: string): Promise<void> {
  await sb.from('tasks').delete().eq('prescription_id', prescriptionId)
  await sb.from('prescriptions').delete().eq('id', prescriptionId)
}
// 되돌리기용: 지운 행을 원래 id 그대로 다시 넣는다
export async function insertRaw(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return
  const { error } = await sb.from(table).insert(rows)
  if (error) throw error
}
