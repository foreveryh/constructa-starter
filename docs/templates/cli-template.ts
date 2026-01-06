#!/usr/bin/env node
/**
 * 通用开发环境 CLI
 * 用途：Docker 基础设施 + 本地应用开发的混合模式
 *
 * 使用方法：
 * 1. 将此文件放到项目根目录 cli/index.ts
 * 2. 在 package.json 添加: "ex0": "node cli/index.ts"
 * 3. 运行: pnpm ex0 init
 */

import { defineCommand, runMain } from 'citty'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// ------------------------
// 工具函数
// ------------------------

const runCommand = (command: string, description: string) => {
  console.log(`\n🔄 ${description}...`)
  try {
    execSync(command, { stdio: 'inherit' })
    console.log(`✅ ${description} 完成`)
  } catch (error) {
    console.error(`❌ ${description} 失败`)
    process.exit(1)
  }
}

const checkDocker = () => {
  try {
    execSync('docker --version', { stdio: 'pipe' })
  } catch {
    console.error('❌ Docker 未安装，请先安装 Docker Desktop')
    process.exit(1)
  }
  try {
    execSync('docker info', { stdio: 'pipe' })
  } catch {
    console.error('❌ Docker 未运行，请先启动 Docker Desktop')
    process.exit(1)
  }
}

// ------------------------
// 命令定义
// ------------------------

/**
 * init - 初始化开发环境
 *
 * 功能：
 * 1. 检查 Docker 是否运行
 * 2. 启动基础设施服务（数据库、缓存、存储等）
 * 3. 运行数据库迁移
 */
const initCommand = defineCommand({
  meta: { name: 'init', description: '初始化开发环境（启动基础设施服务）' },
  async run() {
    console.log('🚀 开始初始化开发环境...\n')

    // 检查 Docker
    checkDocker()

    // 启动基础设施服务
    // 根据项目实际情况修改服务列表
    const services = [
      'db',           // PostgreSQL
      'redis',        // Redis
      'minio',        // S3-compatible storage
      'meilisearch',  // Full-text search
      'provision-minio'  // MinIO bucket provisioning
    ].join(' ')

    runCommand(
      `docker compose up -d ${services}`,
      '启动基础设施服务'
    )

    // 检查是否有 Drizzle 迁移
    if (existsSync('drizzle.config.ts') || existsSync('drizzle.config.js')) {
      runCommand('npx drizzle-kit migrate', '运行数据库迁移')
    }

    // 检查是否有 Prisma 迁移
    if (existsSync('prisma/schema.prisma')) {
      runCommand('npx prisma migrate dev', '运行 Prisma 迁移')
    }

    console.log('\n🎉 开发环境初始化完成！')
    console.log('\n📝 下一步：')
    console.log('   运行 pnpm dev 启动应用')
    console.log('   应用将连接到 Docker 中的服务\n')
  }
})

/**
 * stop - 停止所有服务
 */
const stopCommand = defineCommand({
  meta: { name: 'stop', description: '停止所有 Docker 服务' },
  async run() {
    console.log('🛑 停止 Docker 服务...\n')
    runCommand('docker compose down', '停止服务')
    console.log('\n✅ 所有服务已停止')
  }
})

/**
 * reload - 重启基础设施服务
 *
 * 用途：配置文件修改后重启基础设施
 */
const reloadCommand = defineCommand({
  meta: { name: 'reload', description: '重启基础设施服务' },
  async run() {
    console.log('🔄 重启基础设施服务...\n')
    runCommand('docker compose down', '停止服务')

    const services = [
      'db', 'redis', 'minio', 'meilisearch', 'provision-minio'
    ].join(' ')

    runCommand(
      `docker compose up -d ${services}`,
      '启动服务'
    )

    console.log('\n✅ 基础设施服务已重启')
  }
})

/**
 * logs - 查看服务日志
 */
const logsCommand = defineCommand({
  meta: { name: 'logs', description: '查看 Docker 服务日志' },
  args: {
    service: {
      type: 'string',
      description: '服务名称（默认：所有服务）',
      default: ''
    },
    follow: {
      type: 'boolean',
      description: '持续跟踪日志',
      default: false
    }
  },
  async run({ args }) {
    const service = args.service ? args.service : ''
    const follow = args.follow ? '-f' : ''
    runCommand(
      `docker compose logs ${follow} ${service}`,
      '查看日志'
    )
  }
})

/**
 * status - 查看服务状态
 */
const statusCommand = defineCommand({
  meta: { name: 'status', description: '查看 Docker 服务状态' },
  async run() {
    runCommand('docker compose ps', '查看服务状态')
  }
})

/**
 * clean - 清理未使用的 Docker 资源
 */
const cleanCommand = defineCommand({
  meta: { name: 'clean', description: '清理未使用的 Docker 镜像和缓存' },
  async run() {
    console.log('🧹 清理 Docker 资源...\n')

    runCommand(
      'docker system df',
      '显示当前 Docker 磁盘使用情况'
    )

    const confirm = process.argv.includes('--yes') || process.argv.includes('-y')

    if (!confirm) {
      console.log('\n⚠️  这将删除未使用的 Docker 镜像和构建缓存')
      console.log('    如需确认，请运行: pnpm ex0 clean --yes\n')
      return
    }

    runCommand(
      'docker image prune -a -f',
      '清理未使用的镜像'
    )

    runCommand(
      'docker builder prune -a -f',
      '清理构建缓存'
    )

    runCommand(
      'docker system df',
      '显示清理后的磁盘使用情况'
    )

    console.log('\n✅ 清理完成')
  }
})

// ------------------------
// 主命令
// ------------------------

const main = defineCommand({
  meta: {
    name: 'dev-cli',
    version: '1.0.0',
    description: '开发环境管理 CLI（混合模式：Docker 基础设施 + 本地应用）'
  },
  subCommands: {
    init: initCommand,
    stop: stopCommand,
    reload: reloadCommand,
    logs: logsCommand,
    status: statusCommand,
    clean: cleanCommand,
  }
})

runMain(main)
