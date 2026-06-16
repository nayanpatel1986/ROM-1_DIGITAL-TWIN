import React from 'react';
import { Box, Typography } from '@mui/material';
import { useRig } from '../../context/RigContext';

const AnalogGauge = ({
    value,
    min = 0,
    max = 100,
    label,
    unit,
    size = 200,
    startAngle = -135,
    endAngle = 135,
    majorTicks = 5,
    minorTicks = 4,
    color = '#38bdf8', // Default Cyan
    criticalLevel = 0.8, // 80%
    subValue,
    subLabel,
    precision = 0,
    dataKey,
    onClick
}) => {
    const { alarmEnabled } = useRig();
    // 1. Load customization from local storage if available
    let nMin = typeof min === 'number' && !isNaN(min) ? min : 0;
    let nMax = typeof max === 'number' && !isNaN(max) ? max : 100;
    let gaugeUnit = unit;
    
    let highHighLimit = null;
    let highLimit = null;
    let lowLimit = null;
    let lowLowLimit = null;
    let hornOn = false;

    if (dataKey) {
        const saved = localStorage.getItem(`romi_metric_cfg_${dataKey}`);
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                if (cfg.scaleMin !== undefined) nMin = Number(cfg.scaleMin);
                if (cfg.scaleMax !== undefined) nMax = Number(cfg.scaleMax);
                if (cfg.unit) gaugeUnit = cfg.unit;
                if (cfg.highHighAlarm !== undefined) highHighLimit = Number(cfg.highHighAlarm);
                if (cfg.highAlarm !== undefined) highLimit = Number(cfg.highAlarm);
                if (cfg.lowAlarm !== undefined) lowLimit = Number(cfg.lowAlarm);
                if (cfg.lowLowAlarm !== undefined) lowLowLimit = Number(cfg.lowLowAlarm);
                if (cfg.hornEnabled !== undefined) hornOn = !!cfg.hornEnabled;
            } catch (e) {
                console.warn("Failed to load saved configuration in gauge", e);
            }
        }
    }

    // Calculations
    const nSize = typeof size === 'number' && !isNaN(size) ? size : 200;
    const nValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    
    const radius = nSize / 2;
    const center = nSize / 2;
    const range = endAngle - startAngle;
    const valueRatio = Math.min(Math.max((nValue - nMin) / (nMax - nMin || 1), 0), 1);
    const angle = startAngle + (valueRatio * range);

    // Determine alarm states and active color
    let activeColor = color;
    let pulseAnimation = {};
    let ringGlow = 'none';

    if (alarmEnabled) {
        if (highHighLimit !== null && nValue >= highHighLimit) {
            activeColor = '#ef4444'; // Red alarm
            ringGlow = '0 0 15px #ef4444';
            pulseAnimation = {
                animation: 'alarmPulse 1s infinite alternate',
                '@keyframes alarmPulse': {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(1.03)', boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)' }
                }
            };
        } else if (highLimit !== null && nValue >= highLimit) {
            activeColor = '#fbbf24'; // Yellow warning
            ringGlow = '0 0 8px #fbbf24';
        } else if (lowLowLimit !== null && nValue <= lowLowLimit) {
            activeColor = '#ef4444'; // Red alarm
            ringGlow = '0 0 15px #ef4444';
            pulseAnimation = {
                animation: 'alarmPulse 1s infinite alternate',
                '@keyframes alarmPulse': {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(1.03)', boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)' }
                }
            };
        } else if (lowLimit !== null && nValue <= lowLimit) {
            activeColor = '#fbbf24'; // Yellow warning
            ringGlow = '0 0 8px #fbbf24';
        }
    }

    // Polar to Cartesian
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    // Generate Ticks
    const ticks = [];
    const tickStep = (nMax - nMin) / majorTicks;

    for (let i = 0; i <= majorTicks; i++) {
        const tickValue = nMin + (i * tickStep);
        const tickRatio = (tickValue - nMin) / (nMax - nMin || 1);
        const tickAngle = startAngle + (tickRatio * range);

        // Major Tick
        const p1 = polarToCartesian(center, center, radius - 10, tickAngle);
        const p2 = polarToCartesian(center, center, radius - 22, tickAngle);

        ticks.push(
            <line
                key={`major-${i}`}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="white" strokeWidth="2"
            />
        );

        // Text Label for Tick
        const textPos = polarToCartesian(center, center, radius - (nSize * 0.18), tickAngle);
        ticks.push(
            <text
                key={`text-${i}`}
                x={textPos.x} y={textPos.y}
                textAnchor="middle" alignmentBaseline="middle"
                fill="#94a3b8" fontSize={nSize * 0.055} fontWeight="bold"
            >
                {Math.round(tickValue)}
            </text>
        );

        // Minor Ticks between this major and the next
        if (i < majorTicks && minorTicks > 0) {
            const nextTickValue = nMin + ((i + 1) * tickStep);
            const minorStep = (nextTickValue - tickValue) / (minorTicks + 1);
            for (let j = 1; j <= minorTicks; j++) {
                const minorValue = tickValue + (j * minorStep);
                const minorRatio = (minorValue - nMin) / (nMax - nMin || 1);
                const minorAngle = startAngle + (minorRatio * range);
                const mp1 = polarToCartesian(center, center, radius - 10, minorAngle);
                const mp2 = polarToCartesian(center, center, radius - 16, minorAngle);
                ticks.push(
                    <line
                        key={`minor-${i}-${j}`}
                        x1={mp1.x} y1={mp1.y} x2={mp2.x} y2={mp2.y}
                        stroke="#64748b" strokeWidth="1"
                    />
                );
            }
        }
    }

    // Needle
    const needleTip = polarToCartesian(center, center, radius - 25, angle);
    const needleBaseL = polarToCartesian(center, center, 5, angle - 90);
    const needleBaseR = polarToCartesian(center, center, 5, angle + 90);

    return (
        <Box 
            onClick={onClick}
            sx={{ 
                position: 'relative', 
                width: nSize, 
                height: nSize, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                cursor: onClick ? 'pointer' : 'default',
                borderRadius: '50%',
                transition: 'all 0.2s ease-in-out',
                '&:hover': onClick ? { 
                    transform: 'scale(1.03)',
                    boxShadow: '0 0 15px rgba(56, 189, 248, 0.15)'
                } : {},
                ...pulseAnimation
            }}
        >
            <svg width={nSize} height={nSize} style={{ overflow: 'visible' }}>
                {/* Gauge Background Ring */}
                <circle 
                    cx={center} 
                    cy={center} 
                    r={radius - 5} 
                    fill="none" 
                    stroke={activeColor === color ? '#1e293b' : activeColor} 
                    strokeWidth="4" 
                    style={{ filter: ringGlow !== 'none' ? `drop-shadow(${ringGlow})` : 'none', transition: 'stroke 0.3s' }}
                />

                {/* Ticks */}
                {ticks}

                {/* Needle */}
                <path
                    d={`M ${needleBaseL.x} ${needleBaseL.y} L ${needleTip.x} ${needleTip.y} L ${needleBaseR.x} ${needleBaseR.y} Z`}
                    fill={activeColor}
                    stroke="black"
                    strokeWidth="1"
                    filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.5))"
                />
                <circle cx={center} cy={center} r="6" fill="#334155" stroke="white" strokeWidth="1" />
            </svg>

            {/* Value & Unit - Centered Lower */}
            <Box sx={{ position: 'absolute', top: '65%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: activeColor, fontWeight: 'bold', lineHeight: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)', fontSize: `${nSize * 0.22}px` }}>
                    {typeof nValue === 'number' ? nValue.toFixed(precision) : nValue}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: `${nSize * 0.08}px`, display: 'block' }}>
                    {gaugeUnit}
                </Typography>

                {(subValue !== undefined && subValue !== null) && (
                    <Box sx={{ mt: 1.5, borderTop: '1px solid #334155', pt: 0.5 }}>
                        <Typography variant="body2" sx={{ color: '#bef264', fontWeight: 'bold', fontSize: `${nSize * 0.14}px`, lineHeight: 1 }}>
                            {subValue}
                        </Typography>
                        {label === 'HOOK LOAD' && (
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: `${nSize * 0.04}px`, whiteSpace: 'nowrap' }}>
                                {subLabel || 'BIT WEIGHT'}
                            </Typography>
                        )}
                        {label !== 'HOOK LOAD' && <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: `${nSize * 0.06}px` }}>{subLabel}</Typography>}
                    </Box>
                )}
            </Box>

            {/* Label - Top Center */}
            <Typography variant="body2" sx={{ position: 'absolute', top: '28%', color: '#94a3b8', fontWeight: 'bold', fontSize: `${nSize * 0.05}px`, textTransform: 'uppercase', letterSpacing: 1 }}>
                {label}
            </Typography>
        </Box>
    );
};

export default AnalogGauge;
