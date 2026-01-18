import socket
import struct
import threading
import time
import math

# --- Configuration ---
HOST = '0.0.0.0'
PORT = 502

# --- Atrea RD5 Register Map ---
# Based on definitions.ts for atrea-rd5

# Read Registers
REG_POWER_READ    = 10704  # Current power value (%)
REG_MODE_READ     = 10705  # Current mode (Enum)
REG_TEMP_READ     = 10706  # Current temperature (Scale 0.1, raw value)

# Write Control Registers (Trigger writes)
REG_POWER_CTRL    = 10700  # Control: write 0 to initiate power change
REG_MODE_CTRL     = 10701  # Control: write 0 to initiate mode change
REG_TEMP_CTRL    = 10702  # Control: write 0 to initiate temperature change

# Write Target Registers (Actual values)
REG_POWER_WRITE   = 10708  # Target power value (%)
REG_MODE_WRITE    = 10709  # Target mode value
REG_TEMP_WRITE    = 10710  # Target temperature (Scale 0.1, raw value)

# Extra Sensors (simulated for realism)
REG_TEMP_OUTDOOR = 10300
REG_TEMP_SUPPLY  = 10301

# Mode Enum (Czech names matching definitions.ts)
MODE_VALUES = {
    0: "Vypnuto",
    1: "Auto",
    2: "Větrání",
    3: "Cirkulace+Větrání",
    4: "Cirkulace",
    5: "Noční předchlazení",
    6: "Rozvážení",
    7: "Přetlak",
}

# --- Data Store ---
# Read registers (what the unit reports back)
registers_read = {
    REG_POWER_READ: 40,       # Default 40%
    REG_MODE_READ: 2,         # Default 2 (Větrání)
    REG_TEMP_READ: 225,       # Default 22.5 °C (225 raw)
    REG_TEMP_OUTDOOR: 120,   # 12.0 °C
    REG_TEMP_SUPPLY: 200,     # 20.0 °C
}

# Write control/target registers
registers_write = {
    REG_POWER_CTRL: 0,
    REG_MODE_CTRL: 0,
    REG_TEMP_CTRL: 0,
    REG_POWER_WRITE: 40,
    REG_MODE_WRITE: 2,
    REG_TEMP_WRITE: 225,
}

reg_lock = threading.Lock()

def get_register(addr):
    """Read from appropriate register space"""
    with reg_lock:
        if addr in registers_read:
            return registers_read[addr]
        elif addr in registers_write:
            return registers_write[addr]
        else:
            # Unknown register - return 0
            print(f" [?] Read from unknown register {addr}")
            return 0

def set_register(addr, val):
    """Write to appropriate register space"""
    with reg_lock:
        old_val = 0
        if addr in registers_read:
            old_val = registers_read[addr]
            registers_read[addr] = val
        elif addr in registers_write:
            old_val = registers_write[addr]
            registers_write[addr] = val
        else:
            print(f" [?] Write to unknown register {addr} = {val}")
            return False, val
        return old_val != val, old_val

def physics_loop():
    """
    Simulates unit reacting to write commands.
    This implements the Atrea RD5 write protocol:
    1. Control register (10700-10702) is set to 0
    2. Target register (10708-10710) is set to desired value
    3. After delay, the read register is updated
    """
    print("[*] Physics Engine Running...")
    while True:
        time.sleep(0.1)  # Check every 100ms

        with reg_lock:
            # Check for power write
            if registers_write[REG_POWER_CTRL] == 0 and registers_write[REG_POWER_WRITE] != registers_read[REG_POWER_READ]:
                target = registers_write[REG_POWER_WRITE]
                current = registers_read[REG_POWER_READ]
                print(f" [PHYSICS] Power: {current}% -> {target}%")
                registers_read[REG_POWER_READ] = target
                # Reset control register to prevent repeated writes
                registers_write[REG_POWER_CTRL] = 1

            # Check for temperature write
            if registers_write[REG_TEMP_CTRL] == 0 and registers_write[REG_TEMP_WRITE] != registers_read[REG_TEMP_READ]:
                target = registers_write[REG_TEMP_WRITE]
                current = registers_read[REG_TEMP_READ]
                print(f" [PHYSICS] Temp: {current/10.0}°C -> {target/10.0}°C")
                registers_read[REG_TEMP_READ] = target
                # Reset control register
                registers_write[REG_TEMP_CTRL] = 1

            # Check for mode write
            if registers_write[REG_MODE_CTRL] == 0 and registers_write[REG_MODE_WRITE] != registers_read[REG_MODE_READ]:
                target = registers_write[REG_MODE_WRITE]
                current = registers_read[REG_MODE_READ]
                mode_str = MODE_VALUES.get(target, str(target))
                print(f" [PHYSICS] Mode: {MODE_VALUES.get(current, str(current))} -> {mode_str}")
                registers_read[REG_MODE_READ] = target
                # Reset control register
                registers_write[REG_MODE_CTRL] = 1

            # Simulate Supply Temp moving toward Setpoint
            target_temp = registers_read[REG_TEMP_READ]
            current_supply = registers_read[REG_TEMP_SUPPLY]

            if current_supply < target_temp:
                registers_read[REG_TEMP_SUPPLY] += 1
            elif current_supply > target_temp:
                registers_read[REG_TEMP_SUPPLY] -= 1

            # Simulate Outdoor temp fluctuation
            t = time.time()
            registers_read[REG_TEMP_OUTDOOR] = int(120 + 20 * math.sin(t / 10.0))

def parse_mbap(data):
    """Parse Modbus TCP header"""
    if len(data) < 8: return None
    tid, pid, length, uid, fc = struct.unpack('>HHHBB', data[:8])
    return {'tid':tid, 'pid':pid, 'len':length, 'uid':uid, 'fc':fc, 'payload':data[8:]}

def handle_client(conn, addr):
    print(f"[+] Client connected from {addr}")
    try:
        while True:
            data = conn.recv(1024)
            if not data: break

            frame = parse_mbap(data)
            if not frame: continue

            resp_payload = b''

            # FC 03: Read Holding Registers
            if frame['fc'] == 3:
                start_addr, count = struct.unpack('>HH', frame['payload'][:4])

                vals = []
                for i in range(count):
                    vals.append(get_register(start_addr + i))

                # Log specific reads
                if REG_POWER_READ <= start_addr < REG_POWER_READ + count:
                    idx = REG_POWER_READ - start_addr
                    if 0 <= idx < count:
                        print(f" [READ] Power: {vals[idx]}%")
                if REG_MODE_READ <= start_addr < REG_MODE_READ + count:
                    idx = REG_MODE_READ - start_addr
                    if 0 <= idx < count:
                        mode_val = vals[idx]
                        print(f" [READ] Mode: {mode_val} ({MODE_VALUES.get(mode_val, 'Unknown')})")
                if REG_TEMP_READ <= start_addr < REG_TEMP_READ + count:
                    idx = REG_TEMP_READ - start_addr
                    if 0 <= idx < count:
                        print(f" [READ] Temperature: {vals[idx]/10.0}°C")

                resp_payload = struct.pack('B', count * 2)
                for v in vals:
                    resp_payload += struct.pack('>H', v)

            # FC 06: Write Single Register
            elif frame['fc'] == 6:
                reg_addr, reg_val = struct.unpack('>HH', frame['payload'][:4])
                changed, old_val = set_register(reg_addr, reg_val)

                if changed:
                    # Power control register (10700)
                    if reg_addr == REG_POWER_CTRL:
                        print(f" [WRITE] Power CTRL trigger: {old_val} -> {reg_val}")
                    # Power target register (10708)
                    elif reg_addr == REG_POWER_WRITE:
                        print(f" [WRITE] Power target: {old_val}% -> {reg_val}%")

                    # Temperature control register (10702)
                    elif reg_addr == REG_TEMP_CTRL:
                        print(f" [WRITE] Temp CTRL trigger: {old_val} -> {reg_val}")
                    # Temperature target register (10710)
                    elif reg_addr == REG_TEMP_WRITE:
                        print(f" [WRITE] Temp target: {old_val/10.0}°C -> {reg_val/10.0}°C")

                    # Mode control register (10701)
                    elif reg_addr == REG_MODE_CTRL:
                        print(f" [WRITE] Mode CTRL trigger: {old_val} -> {reg_val}")
                    # Mode target register (10709)
                    elif reg_addr == REG_MODE_WRITE:
                        mode_str = MODE_VALUES.get(reg_val, str(reg_val))
                        print(f" [WRITE] Mode target: {MODE_VALUES.get(old_val, str(old_val))} -> {mode_str}")

                    else:
                        print(f" [WRITE] Reg {reg_addr}: {old_val} -> {reg_val}")

                # Echo back per Modbus spec
                resp_payload = struct.pack('>HH', reg_addr, reg_val)

            # FC 16: Write Multiple Registers
            elif frame['fc'] == 16:
                start_addr, count, byte_count = struct.unpack('>HHB', frame['payload'][:5])
                vals_data = frame['payload'][5:]

                for i in range(count):
                    val = struct.unpack('>H', vals_data[i*2:(i*2)+2])[0]
                    changed, old_val = set_register(start_addr + i, val)
                    if changed:
                        print(f" [WRITE MULTI] {start_addr+i} = {val} (was {old_val})")

                resp_payload = struct.pack('>HH', start_addr, count)

            if resp_payload:
                resp_len = 1 + 1 + len(resp_payload)
                header = struct.pack('>HHHBB', frame['tid'], frame['pid'], resp_len, frame['uid'], frame['fc'])
                conn.sendall(header + resp_payload)

    except Exception as e:
        print(f"[-] Connection Error: {e}")
    finally:
        conn.close()

def start_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server.bind((HOST, PORT))
    except PermissionError:
        print(f"!!! PERMISSION DENIED !!!")
        print(f"You are trying to bind port {PORT} (Standard Modbus).")
        print(f"Please run this script with 'sudo python3 atrea_sim_ha.py'")
        return

    server.listen(5)
    print(f"==========================================")
    print(f" ATREA RD5 SIMULATOR")
    print(f" Protocol: New multi-step write style")
    print(f" Listen: {HOST}:{PORT}")
    print(f"")
    print(f" Read Registers:")
    print(f"   10704: Power (%)")
    print(f"   10705: Mode (Enum)")
    print(f"   10706: Temperature (°C, scale 0.1)")
    print(f"")
    print(f" Write Protocol:")
    print(f"   Power:   10700(ctrl) -> 10708(value)")
    print(f"   Mode:    10701(ctrl) -> 10709(value)")
    print(f"   Temp:     10702(ctrl) -> 10710(value)")
    print(f"==========================================")

    # Background thread to simulate temp changes
    t_sim = threading.Thread(target=physics_loop, daemon=True)
    t_sim.start()

    try:
        while True:
            conn, addr = server.accept()
            t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
            t.start()
    except KeyboardInterrupt:
        print("\nStopping...")
        server.close()

if __name__ == '__main__':
    start_server()
