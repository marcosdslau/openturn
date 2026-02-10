import {
    AiIcon,
    BoxCubeIcon,
    CalenderIcon,
    CallIcon,
    CartIcon,
    ChatIcon,
    GridIcon,
    ListIcon,
    MailIcon,
    PageIcon,
    PieChartIcon,
    PlugInIcon,
    TableIcon,
    TaskIcon,
    UserCircleIcon,
} from "@/icons";

export type NavItem = {
    name: string;
    icon: React.ReactNode;
    path?: string;
    new?: boolean;
    subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

export const getMainNavItems = (basePath: string): NavItem[] => [
    {
        icon: <GridIcon />,
        name: "Dashboard",
        path: `${basePath}/dashboard`,
    },
    {
        icon: <ListIcon />,
        name: "Passagens",
        path: `${basePath}/passagens`,
    },
    {
        icon: <UserCircleIcon />,
        name: "Pessoas",
        path: `${basePath}/pessoas`,
    },
    {
        icon: <BoxCubeIcon />,
        name: "Equipamentos",
        path: `${basePath}/equipamentos`,
    },
];

export const demoNavItems: NavItem[] = [
    {
        icon: <GridIcon />,
        name: "Dashboard",
        subItems: [
            { name: "Ecommerce", path: "/" },
            { name: "Analytics", path: "/analytics" },
            { name: "Marketing", path: "/marketing" },
            { name: "CRM", path: "/crm" },
            { name: "Stocks", path: "/stocks" },
            { name: "SaaS", path: "/saas", new: true },
            { name: "Logistics", path: "/logistics", new: true },
        ],
    },
    {
        name: "AI Assistant",
        icon: <AiIcon />,
        new: true,
        subItems: [
            {
                name: "Text Generator",
                path: "/text-generator",
            },
            {
                name: "Image Generator",
                path: "/image-generator",
            },
            {
                name: "Code Generator",
                path: "/code-generator",
            },
            {
                name: "Video Generator",
                path: "/video-generator",
            },
        ],
    },
    {
        name: "E-commerce",
        icon: <CartIcon />,
        new: true,
        subItems: [
            { name: "Products", path: "/products-list" },
            { name: "Add Product", path: "/add-product" },
            { name: "Billing", path: "/billing" },
            { name: "Invoices", path: "/invoices" },
            { name: "Single Invoice", path: "/single-invoice" },
            { name: "Create Invoice", path: "/create-invoice" },
            { name: "Transactions", path: "/transactions" },
            { name: "Single Transaction", path: "/single-transaction" },
        ],
    },
    {
        icon: <CalenderIcon />,
        name: "Calendar",
        path: "/calendar",
    },
    {
        icon: <UserCircleIcon />,
        name: "User Profile",
        path: "/profile",
    },
    {
        name: "Task",
        icon: <TaskIcon />,
        subItems: [
            { name: "List", path: "/task-list", pro: false },
            { name: "Kanban", path: "/task-kanban", pro: false },
        ],
    },
    {
        name: "Forms",
        icon: <ListIcon />,
        subItems: [
            { name: "Form Elements", path: "/form-elements", pro: false },
            { name: "Form Layout", path: "/form-layout", pro: false },
        ],
    },
    {
        name: "Tables",
        icon: <TableIcon />,
        subItems: [
            { name: "Basic Tables", path: "/basic-tables", pro: false },
            { name: "Data Tables", path: "/data-tables", pro: false },
        ],
    },
    {
        name: "Pages",
        icon: <PageIcon />,
        subItems: [
            { name: "File Manager", path: "/file-manager" },
            { name: "Pricing Tables", path: "/pricing-tables" },
            { name: "FAQ", path: "/faq" },
            { name: "API Keys", path: "/api-keys", new: true },
            { name: "Integrations", path: "/integrations", new: true },
            { name: "Blank Page", path: "/blank" },
            { name: "404 Error", path: "/error-404" },
            { name: "500 Error", path: "/error-500" },
            { name: "503 Error", path: "/error-503" },
            { name: "Coming Soon", path: "/coming-soon" },
            { name: "Maintenance", path: "/maintenance" },
            { name: "Success", path: "/success" },
        ],
    },
];

export const othersItems: NavItem[] = [
    {
        icon: <PieChartIcon />,
        name: "Charts",
        subItems: [
            { name: "Line Chart", path: "/line-chart", pro: false },
            { name: "Bar Chart", path: "/bar-chart", pro: false },
            { name: "Pie Chart", path: "/pie-chart", pro: false },
        ],
    },
    {
        icon: <BoxCubeIcon />,
        name: "UI Elements",
        subItems: [
            { name: "Alerts", path: "/alerts" },
            { name: "Avatar", path: "/avatars" },
            { name: "Badge", path: "/badge" },
            { name: "Breadcrumb", path: "/breadcrumb" },
            { name: "Buttons", path: "/buttons" },
            { name: "Buttons Group", path: "/buttons-group" },
            { name: "Cards", path: "/cards" },
            { name: "Carousel", path: "/carousel" },
            { name: "Dropdowns", path: "/dropdowns" },
            { name: "Images", path: "/images" },
            { name: "Links", path: "/links" },
            { name: "List", path: "/list" },
            { name: "Modals", path: "/modals" },
            { name: "Notification", path: "/notifications" },
            { name: "Pagination", path: "/pagination" },
            { name: "Popovers", path: "/popovers" },
            { name: "Progressbar", path: "/progress-bar" },
            { name: "Ribbons", path: "/ribbons" },
            { name: "Spinners", path: "/spinners" },
            { name: "Tabs", path: "/tabs" },
            { name: "Tooltips", path: "/tooltips" },
            { name: "Videos", path: "/videos" },
        ],
    },
    {
        icon: <PlugInIcon />,
        name: "Authentication",
        subItems: [
            { name: "Sign In", path: "/signin", pro: false },
            { name: "Sign Up", path: "/signup", pro: false },
            { name: "Reset Password", path: "/reset-password" },
            {
                name: "Two Step Verification",
                path: "/two-step-verification",
            },
        ],
    },
];

export const supportItems: NavItem[] = [
    {
        icon: <ChatIcon />,
        name: "Chat",
        path: "/chat",
    },
    {
        icon: <CallIcon />,
        name: "Support",
        new: true,
        subItems: [
            { name: "Support List", path: "/support-tickets" },
            { name: "Support Reply", path: "/support-ticket-reply" },
        ],
    },
    {
        icon: <MailIcon />,
        name: "Email",
        subItems: [
            { name: "Inbox", path: "/inbox" },
            { name: "Details", path: "/inbox-details" },
        ],
    },
];
