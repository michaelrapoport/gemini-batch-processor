import React from 'react';
import { 
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';

interface ChartConfig {
    type: 'bar' | 'line' | 'area' | 'pie' | 'radar' | 'scatter';
    title?: string;
    data: any[];
    xAxisKey?: string;
    dataKeys?: { key: string; color?: string; name?: string }[];
}

interface ChartRendererProps {
    config: ChartConfig;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];

export const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
    const { type, data, xAxisKey = 'name', dataKeys = [{ key: 'value' }], title } = config;
    
    const renderChart = () => {
        switch (type) {
            case 'bar':
                return (
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey={xAxisKey} tick={{fontSize: 12}} />
                        <YAxis tick={{fontSize: 12}} />
                        <Tooltip />
                        <Legend />
                        {dataKeys.map((dk, i) => (
                            <Bar key={dk.key} dataKey={dk.key} fill={dk.color || COLORS[i % COLORS.length]} name={dk.name || dk.key} />
                        ))}
                    </BarChart>
                );
            case 'line':
                return (
                    <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xAxisKey} tick={{fontSize: 12}} />
                        <YAxis tick={{fontSize: 12}} />
                        <Tooltip />
                        <Legend />
                        {dataKeys.map((dk, i) => (
                            <Line type="monotone" key={dk.key} dataKey={dk.key} stroke={dk.color || COLORS[i % COLORS.length]} name={dk.name || dk.key} strokeWidth={2} dot={{r: 4}} />
                        ))}
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                         <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xAxisKey} tick={{fontSize: 12}} />
                        <YAxis tick={{fontSize: 12}} />
                        <Tooltip />
                        <Legend />
                        {dataKeys.map((dk, i) => (
                            <Area type="monotone" key={dk.key} dataKey={dk.key} stroke={dk.color || COLORS[i % COLORS.length]} fill={dk.color || COLORS[i % COLORS.length]} fillOpacity={0.3} name={dk.name || dk.key} />
                        ))}
                    </AreaChart>
                );
            case 'pie':
                return (
                    <PieChart>
                         <Pie
                            data={data}
                            dataKey={dataKeys[0].key}
                            nameKey={xAxisKey}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            fill="#8884d8"
                            label
                        >
                            {data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                );
             case 'radar':
                return (
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey={xAxisKey} tick={{fontSize: 10}} />
                        <PolarRadiusAxis />
                        {dataKeys.map((dk, i) => (
                            <Radar key={dk.key} name={dk.name || dk.key} dataKey={dk.key} stroke={dk.color || COLORS[i % COLORS.length]} fill={dk.color || COLORS[i % COLORS.length]} fillOpacity={0.4} />
                        ))}
                        <Legend />
                        <Tooltip />
                    </RadarChart>
                );
            default:
                return <div>Unsupported chart type</div>;
        }
    };

    return (
        <div className="my-8 p-4 border border-slate-200 rounded-lg bg-slate-50 page-break-inside-avoid shadow-sm">
            {title && <h4 className="text-center font-serif font-bold text-slate-800 mb-4">{title}</h4>}
            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    {renderChart()}
                </ResponsiveContainer>
            </div>
        </div>
    );
};