// 目前用的資料來源。T15 改成 API 的實作時只換這一行。
import { localSource } from './local.ts';
import type { DataSource } from './source.ts';

export const dataSource: DataSource = localSource;
export type { DataSource };
