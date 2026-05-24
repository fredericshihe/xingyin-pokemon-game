#!/bin/bash

echo "🔍 检查Supabase配置..."
echo ""

# 检查环境变量文件
if [ ! -f .env.local ]; then
    echo "❌ 错误: .env.local 文件不存在"
    exit 1
fi

echo "✅ 环境变量文件存在"

# 读取环境变量
source .env.local

if [ -z "$VITE_SUPABASE_URL" ]; then
    echo "❌ 错误: VITE_SUPABASE_URL 未设置"
    exit 1
fi

if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    echo "❌ 错误: VITE_SUPABASE_ANON_KEY 未设置"
    exit 1
fi

echo "✅ Supabase URL: $VITE_SUPABASE_URL"
echo "✅ Supabase Key: ${VITE_SUPABASE_ANON_KEY:0:20}..."
echo ""

echo "📋 下一步操作："
echo ""
echo "1. 在Supabase中执行SQL脚本"
echo "   访问: https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql"
echo "   复制 supabase-setup.sql 的内容并执行"
echo ""
echo "2. 启动开发服务器"
echo "   运行: npm run dev"
echo ""
echo "3. 访问应用"
echo "   打开: http://localhost:3000"
echo ""
