# Rack warehouse model for PLC

Rack warehouse implementation with JetMAx HiWonder robotic arm.  
```mermaid
graph LR
    A[JetMax robotic arm]
    B[Raspberry Pi]
    C[PLK]
    A---|Socket|B---|Modbus|C
```

