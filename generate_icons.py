#!/usr/bin/env python3
"""Generate simple PNG icons for the DualSub extension."""
import struct, zlib, os

def create_png(width, height, r, g, b):
    """Create a minimal valid PNG with a solid color and a simple 'DS' text."""
    # We'll create a simple colored square with a contrasting circle
    
    # Signature
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc & 0xffffffff)
    
    # IDAT chunk - simple image data
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter byte
        for x in range(width):
            # Create a simple design: circle or diamond
            cx, cy = width // 2, height // 2
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5
            max_dist = min(width, height) // 2
            
            if dist < max_dist * 0.85:
                # Inside circle - main color
                raw_data += struct.pack('BBB', r, g, b)
            elif dist < max_dist:
                # Border - white
                raw_data += struct.pack('BBB', 255, 255, 255)
            else:
                # Corner - transparent-ish (dark)
                raw_data += struct.pack('BBB', 30, 30, 30)
    
    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    idat_chunk = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc & 0xffffffff)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND')
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc & 0xffffffff)
    
    return signature + ihdr_chunk + idat_chunk + iend_chunk

def create_png_with_text(width, height, r, g, b):
    """Create a PNG with a more elaborate design - gradient-like."""
    import math
    signature = b'\x89PNG\r\n\x1a\n'
    
    # Use RGBA for better look
    # IHDR: color type 6 (RGBA)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc & 0xffffffff)
    
    raw_data = b''
    cx, cy = width / 2 - 0.5, height / 2 - 0.5
    max_r = min(width, height) / 2
    
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx*dx + dy*dy)
            
            if dist <= max_r * 0.9:
                # Gradated color inside circle
                ratio = dist / (max_r * 0.9)
                rr = int(r + (255 - r) * ratio * 0.3)
                gg = int(g + (255 - g) * ratio * 0.3)
                bb = int(b + (255 - b) * ratio * 0.3)
                raw_data += struct.pack('BBBB', min(rr, 255), min(gg, 255), min(bb, 255), 255)
            elif dist <= max_r:
                # Anti-aliased edge
                alpha = int(255 * (1 - (dist - max_r * 0.9) / (max_r * 0.1)))
                raw_data += struct.pack('BBBB', r, g, b, max(alpha, 0))
            else:
                raw_data += struct.pack('BBBB', 0, 0, 0, 0)
    
    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    idat_chunk = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc & 0xffffffff)
    
    iend_crc = zlib.crc32(b'IEND')
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc & 0xffffffff)
    
    return signature + ihdr_chunk + idat_chunk + iend_chunk

# Generate icons directory
icons_dir = os.path.join(os.path.dirname(__file__), 'icons')

# Blue-purple gradient for learning theme
for size, name in [(16, 'icon16.png'), (48, 'icon48.png'), (128, 'icon128.png')]:
    png_data = create_png_with_text(size, size, 66, 103, 178)  # Nice blue
    with open(os.path.join(icons_dir, name), 'wb') as f:
        f.write(png_data)
    print(f'Created {name} ({size}x{size})')

print('Icons generated successfully!')
