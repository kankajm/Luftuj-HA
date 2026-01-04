import socket
import struct
import threading
import time
import math

# --- Configuration ---
HOST = '0.0.0.0'
PORT = 502  # Must match the 'port: 502' in your YAML.
# Note: On Linux/Mac, ports < 1024 require 'sudo'.

# --- Atrea/Home Assistant Register Map ---
# Derived directly from your configuration.yaml
REG_POWER       = 10704  # hru_requested_power_value (%)
REG_MODE        = 10705  # hru_mode_value (Enum)
REG_TEMP_SET    = 10706  # hru_requested_temperature_value (Scale 0.1)

# Extra Sensors (Standard Atrea) - kept for realism if you add them later
REG_TEMP_OUTDOOR = 10300
REG_TEMP_SUPPLY  = 10301

# --- Data Store ---
# Initial values matching your Input Number defaults
registers = {
    REG_POWER: 40,      # Default 40%
    REG_MODE: 1,        # Default 1 (Automat)
    REG_TEMP_SET: 225,  # Default 22.5 °C (225 raw)
    REG_TEMP_OUTDOOR: 120, # 12.0 °C
    REG_TEMP_SUPPLY: 200,  # 20.0 °C
}

reg_lock = threading.Lock()

def get_register(addr):
    with reg_lock:
        return registers.get(addr, 0)

def set_register(addr, val):
    with reg_lock:
        old = registers.get(addr, 0)
        registers[addr] = val
        return old != val, old

def physics_loop():
    """
    Simulates the unit reacting to your Home Assistant changes.
    """
    print("[*] Physics Engine Running...")
    t = 0
    while True:
        time.sleep(1)
        t += 1

        with reg_lock:
            # Simulate Supply Temp moving toward Setpoint
            # We read the raw integer values (225 = 22.5 C)
            target = registers[REG_TEMP_SET]
            current = registers[REG_TEMP_SUPPLY]

            # Simple approach logic
            if current < target:
                registers[REG_TEMP_SUPPLY] += 1
            elif current > target:
                registers[REG_TEMP_SUPPLY] -= 1

            # Simulate Outdoor temp fluctuation
            registers[REG_TEMP_OUTDOOR] = int(120 + 20 * math.sin(t / 10.0))

def parse_mbap(data):
    if len(data) < 8: return None
    tid, pid, length, uid, fc = struct.unpack('>HHHBB', data[:8])
    return {'tid':tid, 'pid':pid, 'len':length, 'uid':uid, 'fc':fc, 'payload':data[8:]}

def handle_client(conn, addr):
    print(f"[+] Home Assistant connected from {addr}")
    try:
        while True:
            data = conn.recv(1024)
            if not data: break

            frame = parse_mbap(data)
            if not frame: continue

            resp_payload = b''

            # FC 03: Read Holding Registers (Home Assistant Polling)
            if frame['fc'] == 3:
                start_addr, count = struct.unpack('>HH', frame['payload'][:4])

                vals = []
                for i in range(count):
                    # Fetch value from our simulated memory
                    vals.append(get_register(start_addr + i))

                # Log specific reads for debugging
                if start_addr == REG_POWER:
                    print(f" [HA READ] Power: {vals[0]}%")
                elif start_addr == REG_TEMP_SET:
                    print(f" [HA READ] Set Temp: {vals[0]/10.0}°C")
                elif start_addr == REG_MODE:
                    print(f" [HA READ] Mode: {vals[0]}")

                resp_payload = struct.pack('B', count * 2)
                for v in vals:
                    resp_payload += struct.pack('>H', v)

            # FC 06: Write Single Register (Home Assistant Commands)
            elif frame['fc'] == 6:
                reg_addr, reg_val = struct.unpack('>HH', frame['payload'][:4])
                changed, old_val = set_register(reg_addr, reg_val)

                if changed:
                    if reg_addr == REG_POWER:
                        print(f" [HA WRITE] Set Power: {old_val}% -> {reg_val}%")
                    elif reg_addr == REG_TEMP_SET:
                        print(f" [HA WRITE] Set Temp: {old_val/10.0}°C -> {reg_val/10.0}°C")
                    elif reg_addr == REG_MODE:
                        modes = {0:"OFF", 1:"AUTO", 2:"VENT", 3:"CIRC+VENT", 4:"CIRC"}
                        mode_str = modes.get(reg_val, str(reg_val))
                        print(f" [HA WRITE] Set Mode: {mode_str}")
                    else:
                        print(f" [HA WRITE] Reg {reg_addr}: {old_val} -> {reg_val}")

                # Echo back per Modbus spec
                resp_payload = struct.pack('>HH', reg_addr, reg_val)

            # FC 16: Write Multiple Registers
            elif frame['fc'] == 16:
                start_addr, count, byte_count = struct.unpack('>HHB', frame['payload'][:5])
                vals_data = frame['payload'][5:]
                for i in range(count):
                    val = struct.unpack('>H', vals_data[i*2:(i*2)+2])[0]
                    set_register(start_addr + i, val)
                    print(f" [HA WRITE MULTI] {start_addr+i} = {val}")

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
        # Note: Port 502 requires sudo/admin rights
        server.bind((HOST, PORT))
    except PermissionError:
        print(f"!!! PERMISSION DENIED !!!")
        print(f"You are trying to bind port {PORT} (Standard Modbus).")
        print(f"Please run this script with 'sudo python3 script_name.py'")
        return

    server.listen(5)
    print(f"==========================================")
    print(f" ATREA RD5 SIMULATOR (Home Assistant Mode)")
    print(f" Listen: {HOST}:{PORT}")
    print(f" Map:    10704 (Power), 10705 (Mode), 10706 (Temp)")
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