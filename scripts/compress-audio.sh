#!/bin/bash

# 音频压缩脚本
# 使用ffmpeg将下载的音频文件压缩到最小体积

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIO_DIR="$PROJECT_ROOT/public/assets/audio"
TEMP_DIR="$PROJECT_ROOT/.tmp-audio-compress"

echo "╔════════════════════════════════════╗"
echo "║     音频文件压缩工具 v1.0          ║"
echo "╚════════════════════════════════════╝"
echo ""

# 检查ffmpeg是否安装
if ! command -v ffmpeg &> /dev/null; then
    echo "✗ 错误: 未找到ffmpeg"
    echo ""
    echo "请先安装ffmpeg:"
    echo "  macOS:   brew install ffmpeg"
    echo "  Ubuntu:  sudo apt install ffmpeg"
    echo "  Windows: 从 https://ffmpeg.org/download.html 下载"
    exit 1
fi

echo "✓ ffmpeg已安装"
echo ""

# 创建临时目录
mkdir -p "$TEMP_DIR"

# 压缩统计
total_files=0
compressed_files=0
failed_files=0
original_size=0
compressed_size=0

# 压缩单个文件
compress_file() {
    local input="$1"
    local output="$2"
    local is_bgm="$3"

    if [ ! -f "$input" ]; then
        echo "  ✗ 文件不存在: $input"
        return 1
    fi

    # 获取原始文件大小
    local input_size=$(stat -f%z "$input" 2>/dev/null || stat -c%s "$input" 2>/dev/null)
    original_size=$((original_size + input_size))

    # 设置压缩参数
    if [ "$is_bgm" = "true" ]; then
        # BGM: 96kbps 立体声 44.1kHz
        params="-c:a libvorbis -q:a 3 -ar 44100 -ac 2"
    else
        # SFX: 64kbps 单声道 22.05kHz
        params="-c:a libvorbis -q:a 2 -ar 22050 -ac 1"
    fi

    # 压缩
    if ffmpeg -i "$input" $params "$output" -y -loglevel error 2>&1; then
        local output_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
        compressed_size=$((compressed_size + output_size))

        local reduction=$(echo "scale=1; (1 - $output_size / $input_size) * 100" | bc)
        echo "  ✓ 压缩完成 (减少 ${reduction}%)"

        # 替换原文件
        mv "$output" "$input"
        compressed_files=$((compressed_files + 1))
        return 0
    else
        echo "  ✗ 压缩失败"
        failed_files=$((failed_files + 1))
        return 1
    fi
}

# 压缩地图BGM
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "压缩地图BGM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -d "$AUDIO_DIR/maps" ]; then
    for file in "$AUDIO_DIR/maps"/*.{ogg,mp3,wav} 2>/dev/null; do
        [ -f "$file" ] || continue
        total_files=$((total_files + 1))

        filename=$(basename "$file")
        echo "[BGM] $filename"

        temp_output="$TEMP_DIR/$filename"
        compress_file "$file" "$temp_output" "true"
        echo ""
    done
else
    echo "⚠ 未找到地图BGM目录"
    echo ""
fi

# 压缩技能音效
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "压缩技能音效"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -d "$AUDIO_DIR/sfx" ]; then
    for type_dir in "$AUDIO_DIR/sfx"/*; do
        [ -d "$type_dir" ] || continue

        type_name=$(basename "$type_dir")
        echo "--- ${type_name^^} 系 ---"
        echo ""

        for file in "$type_dir"/*.{ogg,mp3,wav} 2>/dev/null; do
            [ -f "$file" ] || continue
            total_files=$((total_files + 1))

            filename=$(basename "$file")
            echo "[SFX] $filename"

            temp_output="$TEMP_DIR/$filename"
            compress_file "$file" "$temp_output" "false"
            echo ""
        done
    done
else
    echo "⚠ 未找到技能音效目录"
    echo ""
fi

# 清理临时目录
rm -rf "$TEMP_DIR"

# 显示统计信息
echo "╔════════════════════════════════════╗"
echo "║          压缩任务完成！            ║"
echo "╚════════════════════════════════════╝"
echo ""
echo "统计信息:"
echo "  • 总文件数: $total_files"
echo "  • 成功压缩: $compressed_files"
echo "  • 失败: $failed_files"

if [ $compressed_files -gt 0 ]; then
    original_mb=$(echo "scale=2; $original_size / 1024 / 1024" | bc)
    compressed_mb=$(echo "scale=2; $compressed_size / 1024 / 1024" | bc)
    total_reduction=$(echo "scale=1; (1 - $compressed_size / $original_size) * 100" | bc)

    echo "  • 原始大小: ${original_mb} MB"
    echo "  • 压缩后: ${compressed_mb} MB"
    echo "  • 总体减少: ${total_reduction}%"
fi

echo ""
